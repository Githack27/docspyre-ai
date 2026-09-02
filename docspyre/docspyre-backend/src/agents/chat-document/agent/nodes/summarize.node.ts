import { createChatModel } from '../../llm/model.factory';
import { summarizerService } from '../../ingestion/summarizer.service';
import { buildSummarizeAnswerPrompt } from '../prompts';
import { streamAnswer, emitDegraded, type AgentRuntime } from '../runtime';
import type { AgentStateType, AgentStateUpdate } from '../state';

const NO_SUMMARY_MESSAGE =
  'This document has not finished processing yet, so I do not have a summary for it. Give it a moment and ask again.';

/**
 * Answers summary requests from pre-computed summaries rather than retrieval.
 *
 * Top-k retrieval systematically under-covers "what is this about" questions
 * because it returns a handful of passages; the ingest-time summary reflects the
 * whole file at a fraction of the prompt cost.
 */
export const summarizeNode = (runtime: AgentRuntime) =>
  async (state: AgentStateType): Promise<AgentStateUpdate> => {
    const overviewText = await runtime.tools.documentOverview.invoke({ includeSections: true });

    const last = runtime.ctx.toolCalls[runtime.ctx.toolCalls.length - 1];
    if (last) runtime.emit({ type: 'tool', tool: last.tool, summary: last.summary });

    const overview = runtime.ctx.documentId
      ? await summarizerService.getDocumentSummary(runtime.ctx.documentId)
      : null;

    if (!overview) {
      // Fall back to retrieval so the user still gets something useful.
      const contextText = await runtime.tools.searchDocument.invoke({ query: state.question });

      if (!runtime.ctx.artifacts.chunks.length || !runtime.provider) {
        return {
          answer: emitDegraded(runtime, NO_SUMMARY_MESSAGE),
          answerSource: 'degraded',
          contextText: typeof contextText === 'string' ? contextText : '',
        };
      }

      return {
        route: 'document_qa',
        chunks: [...runtime.ctx.artifacts.chunks],
        contextText: typeof contextText === 'string' ? contextText : '',
      };
    }

    if (!runtime.provider) {
      // No model, but a stored summary exists: return it verbatim.
      return {
        answer: emitDegraded(runtime, overview.summary),
        answerSource: 'summary',
      };
    }

    const sections = runtime.ctx.documentId
      ? await summarizerService.getSectionSummaries(runtime.ctx.documentId)
      : [];

    const { system, user } = buildSummarizeAnswerPrompt({
      question: state.question,
      documentSummary: overview.summary,
      keyPoints: overview.keyPoints,
      sectionSummaries: sections.map((section) => ({
        heading: section.heading,
        summary: section.summary,
      })),
      conversation: runtime.conversation,
      persona: runtime.provider.systemPrompt,
    });

    const model = createChatModel(runtime.provider, { temperature: 0.2, maxTokens: 1600 });
    const { text, usage } = await streamAnswer(runtime, model, system, user);

    if (!text.trim()) {
      return { answer: emitDegraded(runtime, overview.summary), answerSource: 'summary' };
    }

    return {
      answer: text,
      usage,
      answerSource: 'summary',
      // Summaries are derived from the whole file, so there is no single chunk
      // to cite; leaving citations empty keeps the contract honest.
      citations: [],
      contextText: typeof overviewText === 'string' ? overviewText : '',
    };
  };
