import { env } from '../../../../core/config';
import { createChatModel } from '../../llm/model.factory';
import { messageText, unfence } from '../../llm/output';
import { DATASET_SQL_SYSTEM, buildDatasetSqlPrompt } from '../prompts';
import { emitDegraded, type AgentRuntime } from '../runtime';
import type { AgentStateType, AgentStateUpdate } from '../state';

const FAILURE_MARKER = 'QUERY_FAILED:';

const NO_MODEL_MESSAGE =
  'I cannot reach a language model right now, so I am unable to turn that into a query. Add an AI provider key in Settings, or try again shortly.';

/**
 * Generates one SQL statement for the question.
 *
 * On a retry, the previous statement and its error are included so the model
 * repairs rather than guesses again from scratch.
 */
export const generateSqlNode = (runtime: AgentRuntime) =>
  async (state: AgentStateType): Promise<AgentStateUpdate> => {
    if (!runtime.provider) {
      return {
        answer: emitDegraded(runtime, NO_MODEL_MESSAGE),
        answerSource: 'degraded',
        sqlAttempts: state.sqlAttempts + 1,
      };
    }

    const attempt = state.sqlAttempts + 1;

    const model = createChatModel(runtime.provider, { temperature: 0, maxTokens: 700 });
    const response = await model.invoke([
      { role: 'system', content: DATASET_SQL_SYSTEM },
      {
        role: 'user',
        content: buildDatasetSqlPrompt({
          question: state.question,
          schemas: runtime.ctx.datasetSchemas,
          conversation: runtime.conversation,
          previousSql: state.sql ?? undefined,
          previousError: state.sqlError ?? undefined,
          maxRows: env.DUCKDB_MAX_ROWS,
        }),
      },
    ]);

    const sql = unfence(messageText(response)).replace(/;\s*$/, '').trim();

    if (!sql) {
      return {
        sqlAttempts: attempt,
        sqlError: 'The model returned an empty statement.',
      };
    }

    runtime.emit({ type: 'sql', sql, attempt });
    return { sql, sqlAttempts: attempt, sqlError: null };
  };

/**
 * Executes the generated SQL in the sandbox. Failures are recorded in state so
 * the graph can decide between a repair attempt and giving up.
 */
export const executeSqlNode = (runtime: AgentRuntime) =>
  async (state: AgentStateType): Promise<AgentStateUpdate> => {
    if (!state.sql) {
      return { sqlError: state.sqlError ?? 'No statement to execute.' };
    }

    const raw = await runtime.tools.queryDataset.invoke({
      sql: state.sql,
      question: state.question,
    });

    const output = typeof raw === 'string' ? raw : String(raw);

    const last = runtime.ctx.toolCalls[runtime.ctx.toolCalls.length - 1];
    if (last) runtime.emit({ type: 'tool', tool: last.tool, summary: last.summary });

    if (output.startsWith(FAILURE_MARKER)) {
      return { sqlError: output.slice(FAILURE_MARKER.length).trim(), sqlResultText: null };
    }

    return { sqlResultText: output, sqlError: null };
  };

/** True while a repair attempt is still worth making. */
export const shouldRetrySql = (state: AgentStateType): boolean =>
  Boolean(state.sqlError) && state.sqlAttempts < env.AGENT_SQL_MAX_ATTEMPTS && !state.answer;
