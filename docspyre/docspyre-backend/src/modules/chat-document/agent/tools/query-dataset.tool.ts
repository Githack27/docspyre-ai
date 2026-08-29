import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { db, datasetQueries } from '@docspyre/database';
import { logger } from '../../../../core/utils/logger';
import { duckdbService, DatasetQueryError } from '../../data/duckdb.service';
import { recordToolCall, type AgentToolContext } from './context';

const schema = z.object({
  sql: z
    .string()
    .min(1)
    .describe(
      'A single read-only DuckDB SELECT (or WITH) statement over the available tables. No DDL, DML, or file-reading functions.',
    ),
  question: z
    .string()
    .optional()
    .describe('The user question this query answers. Recorded for auditing.'),
});

/** Compact tabular rendering so the model sees results without JSON overhead. */
const renderRows = (columns: string[], rows: Record<string, unknown>[]): string => {
  if (!rows.length) return 'Query returned 0 rows.';

  const header = `| ${columns.join(' | ')} |`;
  const divider = `| ${columns.map(() => '---').join(' | ')} |`;
  const body = rows
    .slice(0, 50)
    .map((row) => `| ${columns.map((column) => formatCell(row[column])).join(' | ')} |`)
    .join('\n');

  return [header, divider, body].join('\n');
};

const formatCell = (value: unknown): string => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value).replace(/\|/g, '\\|');
};

/**
 * Executes model-authored SQL against the user's data file inside the DuckDB
 * sandbox. Rejections and engine errors are returned as text rather than thrown
 * so the agent can repair the statement and retry.
 */
export const createQueryDatasetTool = (ctx: AgentToolContext) =>
  tool(
    async ({ sql, question }) =>
      recordToolCall(ctx, 'query_dataset', { sql }, async () => {
        if (!ctx.datasetSources.length) {
          return {
            result: 'No data table is available for this file.',
            summary: 'no dataset sources',
          };
        }

        const startedAt = Date.now();

        try {
          const result = await duckdbService.execute(ctx.datasetSources, sql);

          ctx.artifacts.sql = sql;
          ctx.artifacts.sqlRowCount = result.rows.length;

          void auditQuery({
            documentId: ctx.documentId,
            question: question ?? '',
            sql,
            outcome: 'OK',
            rowCount: result.rows.length,
            durationMs: result.durationMs,
            error: null,
          });

          const notice = result.truncated
            ? `\n\nNote: result truncated to ${result.rows.length} rows.`
            : '';

          return {
            result: `${renderRows(result.columns, result.rows)}${notice}`,
            summary: `${result.rows.length} rows in ${result.durationMs}ms`,
          };
        } catch (error) {
          const isGuarded = error instanceof DatasetQueryError;
          const message = error instanceof Error ? error.message : String(error);

          void auditQuery({
            documentId: ctx.documentId,
            question: question ?? '',
            sql,
            outcome: isGuarded && error.kind === 'REJECTED' ? 'REJECTED' : 'ERROR',
            rowCount: null,
            durationMs: Date.now() - startedAt,
            error: message,
          });

          // Returned, not thrown: the caller decides whether to retry.
          return {
            result: `QUERY_FAILED: ${message}`,
            summary: `failed: ${message}`,
          };
        }
      }),
    {
      name: 'query_dataset',
      description:
        'Run a read-only SQL query against the user\'s uploaded data file (CSV, Excel, Parquet, JSON, SQLite or DuckDB). Use for totals, averages, counts, filtering, grouping and ranking.',
      schema,
    },
  );

/** Fire-and-forget audit write; never blocks or fails the turn. */
const auditQuery = async (input: {
  documentId: string | null;
  question: string;
  sql: string;
  outcome: 'OK' | 'REJECTED' | 'ERROR';
  rowCount: number | null;
  durationMs: number;
  error: string | null;
}): Promise<void> => {
  if (!input.documentId) return;

  try {
    await db.insert(datasetQueries).values({
      documentId: input.documentId,
      question: input.question.slice(0, 2_000),
      sql: input.sql,
      outcome: input.outcome,
      rowCount: input.rowCount,
      durationMs: input.durationMs,
      error: input.error,
    });
  } catch (error) {
    logger.debug('Dataset query audit failed', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
};
