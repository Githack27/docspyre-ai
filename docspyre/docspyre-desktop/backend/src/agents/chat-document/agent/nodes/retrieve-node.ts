import { env } from '../../../../core/config';
import type { AgentRuntime } from '../runtime';
import type { AgentStateType, AgentStateUpdate } from '../state';

/**
 * Gathers grounding excerpts through the search tool. Runs before the document
 * QA answer node so the answer never has to guess what is in the file.
 *
 * If retrieval returns 0 chunks from the document, it triggers the DuckDuckGo
 * web search tool to find relevant external answers.
 */
export const retrieveNode = (runtime: AgentRuntime) =>
  async (state: AgentStateType): Promise<AgentStateUpdate> => {
    const contextText = await runtime.tools.searchDocument.invoke({
      query: state.question,
      topK: env.AGENT_MAX_CONTEXT_CHUNKS,
    });

    const searchCall = runtime.ctx.toolCalls[runtime.ctx.toolCalls.length - 1];
    if (searchCall) runtime.emit({ type: 'tool', tool: searchCall.tool, summary: searchCall.summary });

    const chunks = [...runtime.ctx.artifacts.chunks];
    let webResults: Array<{ title: string; snippet: string; url: string }> = [];

    // If 0 chunks found in the document, invoke DuckDuckGo web search
    if (!chunks.length) {
      runtime.emit({
        type: 'notice',
        message: 'No document excerpts found matching query. Initiating DuckDuckGo web search...',
      });

      await runtime.tools.webSearch.invoke({
        query: state.question,
        maxResults: 5,
      });

      const webCall = runtime.ctx.toolCalls[runtime.ctx.toolCalls.length - 1];
      if (webCall) runtime.emit({ type: 'tool', tool: webCall.tool, summary: webCall.summary });

      webResults = [...(runtime.ctx.artifacts.webResults || [])];
    }

    return {
      chunks,
      webResults,
      contextText: typeof contextText === 'string' ? contextText : String(contextText),
    };
  };
