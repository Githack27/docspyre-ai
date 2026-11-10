import { createChatModel } from '../../llm/model.factory';
import { buildDatasetAnswerPrompt } from '../prompts';
import { streamAnswer, emitDegraded, type AgentRuntime } from '../runtime';
import type { AgentStateType, AgentStateUpdate } from '../state';

/** Parses the markdown table the query tool produced back into rows. */
const parseTable = (text: string): { columns: string[]; rows: Record<string, unknown>[] } => {
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('|'));

  if (lines.length < 2) return { columns: [], rows: [] };

  const splitRow = (line: string): string[] =>
    line
      .replace(/^\|/, '')
      .replace(/\|$/, '')
      .split('|')
      .map((cell) => cell.trim());

  const columns = splitRow(lines[0] ?? '');
  const rows = lines.slice(2).map((line) => {
    const cells = splitRow(line);
    const row: Record<string, unknown> = {};
    columns.forEach((column, index) => {
      row[column] = cells[index] ?? null;
    });
    return row;
  });

  return { columns, rows };
};

/**
 * Reports the query result in prose. The result set is the only evidence, so
 * the model is instructed not to recompute or extrapolate beyond it.
 */
export const datasetAnswerNode = (runtime: AgentRuntime) =>
  async (state: AgentStateType): Promise<AgentStateUpdate> => {
    // Every repair attempt was exhausted.
    if (!state.sqlResultText) {
      const detail = state.sqlError ? ` The last error was: ${state.sqlError}` : '';
      const message = `I could not build a working query for that against this data file.${detail} Try naming the columns you want, or rephrasing the calculation.`;
      return {
        answer: emitDegraded(runtime, message),
        answerSource: 'degraded',
        error: state.sqlError ?? null,
      };
    }

    if (!runtime.provider) {
      // Without a model, the raw result table is still a useful answer.
      return {
        answer: emitDegraded(runtime, state.sqlResultText),
        answerSource: 'dataset',
      };
    }

    const { columns, rows } = parseTable(state.sqlResultText);
    const truncated = state.sqlResultText.includes('result truncated');

    const { system, user } = buildDatasetAnswerPrompt({
      question: state.question,
      sql: state.sql ?? '',
      columns,
      rows,
      truncated,
      conversation: runtime.conversation,
      persona: runtime.provider.systemPrompt,
    });

    const model = createChatModel(runtime.provider, { temperature: 0.1, maxTokens: 1600 });
    const { text, usage } = await streamAnswer(runtime, model, system, user);

    if (!text.trim()) {
      return {
        answer: emitDegraded(runtime, state.sqlResultText),
        answerSource: 'dataset',
      };
    }

    return { answer: text, usage, answerSource: 'dataset', citations: [] };
  };
