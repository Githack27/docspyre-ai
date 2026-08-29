import { env } from '../../../../core/config';
import type { AgentRuntime } from '../runtime';
import type { AgentStateType, AgentStateUpdate } from '../state';

/**
 * Gathers grounding excerpts through the search tool. Runs before the document
 * QA answer node so the answer never has to guess what is in the file.
 */
export const retrieveNode = (runtime: AgentRuntime) =>
  async (state: AgentStateType): Promise<AgentStateUpdate> => {
    const contextText = await runtime.tools.searchDocument.invoke({
      query: state.question,
      topK: env.AGENT_MAX_CONTEXT_CHUNKS,
    });

    const last = runtime.ctx.toolCalls[runtime.ctx.toolCalls.length - 1];
    if (last) runtime.emit({ type: 'tool', tool: last.tool, summary: last.summary });

    return {
      chunks: [...runtime.ctx.artifacts.chunks],
      contextText: typeof contextText === 'string' ? contextText : String(contextText),
    };
  };
