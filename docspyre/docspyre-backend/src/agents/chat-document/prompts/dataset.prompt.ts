import type { DatasetSchema } from '../data/dataset.service';
import type { ConversationContext } from '../memory/conversation-summary.service';
import { composeSystemPrompt, ANSWER_FORMAT } from './system.prompt';
import { renderConversation } from './document-qa.prompt';

export const DATASET_SQL_SYSTEM = `You translate analytical questions into exactly one DuckDB SQL SELECT statement over the user's data tables.

Strict Safety & Query Rules:
- Return ONLY the executable SQL query. Do not wrap in markdown quotes or add explanations.
- Only SELECT or WITH queries are permitted. Never use INSERT, UPDATE, DELETE, DROP, CREATE, ALTER, ATTACH, COPY, INSTALL, or LOAD.
- Use only tables and columns defined in the provided schema. Double-quote identifiers with spaces or capitals: "Revenue".
- Cast numeric text columns safely before aggregating: SUM(TRY_CAST("Amount" AS DOUBLE)).
- Always provide a reasonable LIMIT (e.g., LIMIT 50) unless the query is an explicit scalar aggregate.`;

const renderDatasetSchema = (schemas: DatasetSchema[]): string =>
  schemas
    .map((schema) => {
      const columns = schema.columns
        .map((column) => {
          const samples = column.sampleValues?.length
            ? ` — samples: ${column.sampleValues.slice(0, 3).map((v) => JSON.stringify(v)).join(', ')}`
            : '';
          return `  - "${column.name}" ${column.type}${column.nullable ? ' NULL' : ''}${samples}`;
        })
        .join('\n');

      const rows = schema.rowCount != null ? ` (${schema.rowCount} rows)` : '';
      return `Table "${schema.tableName}"${rows}${schema.sheetName ? ` [sheet: ${schema.sheetName}]` : ''}:\n${columns}`;
    })
    .join('\n\n');

export const buildDatasetSqlPrompt = (input: {
  question: string;
  schemas: DatasetSchema[];
  conversation: ConversationContext;
  previousSql?: string;
  previousError?: string;
  maxRows: number;
}): string => {
  const repair = input.previousError
    ? [
        '## Previous Query Attempt Failed',
        `SQL:\n${input.previousSql ?? '(none)'}`,
        `Error:\n${input.previousError}`,
        'Fix the statement. Re-check column names and data types against the schema.',
      ].join('\n')
    : '';

  const followUp = input.conversation.recentTurns.length
    ? `## Recent Context\n${input.conversation.recentTurns
        .map((turn) => `${turn.role === 'user' ? 'User' : 'Assistant'}: ${turn.content}`)
        .join('\n')}`
    : '';

  return [
    `## Available Dataset Schemas\n${renderDatasetSchema(input.schemas)}`,
    `Row limit: ${input.maxRows}`,
    followUp,
    repair,
    `## Question to Answer\n${input.question}`,
    'SQL:',
  ]
    .filter(Boolean)
    .join('\n\n');
};

export const buildDatasetAnswerPrompt = (input: {
  question: string;
  sql: string;
  columns: string[];
  rows: Record<string, unknown>[];
  truncated: boolean;
  conversation: ConversationContext;
  persona?: string | null;
  workspacePersona?: string | null;
}): { system: string; user: string } => {
  const system = composeSystemPrompt(
    [
      `## Task: Dataset Analysis Result
You are explaining the results of a SQL query executed over the user's tabular dataset.
- State the answer clearly using the data rows returned.
- If results are tabular, present them using a Markdown table. If single scalar, state it directly.
- If no rows match, explain that no records satisfied the filter criteria.
- Never show the raw SQL unless specifically requested.`,
      ANSWER_FORMAT,
    ],
    input.persona,
    input.workspacePersona,
  );

  const preview = JSON.stringify(input.rows.slice(0, 50), null, 2);

  const user = [
    `## Executed SQL Query\n\`\`\`sql\n${input.sql}\n\`\`\``,
    `## Result Columns\n${input.columns.join(', ') || '(none)'}`,
    `## Data Rows (${input.rows.length}${input.truncated ? ', truncated' : ''})\n\`\`\`json\n${preview}\n\`\`\``,
    renderConversation(input.conversation),
    `## User Question\n${input.question}`,
  ]
    .filter(Boolean)
    .join('\n\n');

  return { system, user };
};

export const DATASET_DESCRIPTION_SYSTEM = `You generate a concise, analytical description of a data table for text-to-SQL synthesis.
Rules:
- 1 concise paragraph explaining what a single row represents and highlighting major columns.
- State units or date frequency if obvious from values. Output description text only.`;

export const buildDatasetDescriptionPrompt = (input: {
  tableName: string;
  columns: { name: string; type: string; sampleValues?: unknown[] }[];
  rowCount: number | null;
}): string =>
  [
    `Table: ${input.tableName}${input.rowCount != null ? ` (${input.rowCount} rows)` : ''}`,
    `Columns:\n${input.columns
      .map((col) => `- "${col.name}" (${col.type})`)
      .join('\n')}`,
    'Description:',
  ].join('\n\n');
