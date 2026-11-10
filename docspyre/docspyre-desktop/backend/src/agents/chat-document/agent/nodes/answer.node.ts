import { createChatModel } from '../../llm/model.factory';
import { summarizerService } from '../../ingestion/summarizer.service';
import { buildDocumentQaPrompt, buildWebSearchAnswerPrompt } from '../prompts';
import { streamAnswer, emitDegraded, type AgentRuntime } from '../runtime';
import {
  citationsFrom,
  webCitationsFrom,
  type AgentStateType,
  type AgentStateUpdate,
} from '../state';

const NO_MODEL_MESSAGE =
  'I cannot reach a language model right now, so I am unable to answer from the document. Add an AI provider key in Settings, or try again shortly.';

const NO_CONTEXT_MESSAGE =
  'I could not find anything in this document or through web search addressing that. Could you rephrase your question, or specify a section or topic you expect it to appear under?';

/**
 * Produces the grounded answer for the document QA branch.
 *
 * If document chunks were retrieved, answers from the document with [1], [2] citations.
 * If 0 document chunks were retrieved, synthesizes the answer from DuckDuckGo web search
 * results using distinct [W1], [W2] citations.
 */
export const answerNode = (runtime: AgentRuntime) =>
  async (state: AgentStateType): Promise<AgentStateUpdate> => {
    if (!runtime.provider) {
      return {
        answer: emitDegraded(runtime, NO_MODEL_MESSAGE),
        citations: [],
        answerSource: 'degraded',
      };
    }

    // Branch A: Document Grounding (Chunks found)
    if (state.chunks.length > 0) {
      const citations = citationsFrom(state.chunks);
      const overview = runtime.ctx.documentId
        ? await summarizerService.getDocumentSummary(runtime.ctx.documentId)
        : null;

      const { system, user } = buildDocumentQaPrompt({
        question: state.question,
        chunks: state.chunks,
        documentSummary: overview?.summary ?? null,
        conversation: runtime.conversation,
        persona: runtime.provider.systemPrompt,
      });

      const model = createChatModel(runtime.provider, { temperature: 0.1, maxTokens: 2048 });
      const { text, usage } = await streamAnswer(runtime, model, system, user);

      if (!text.trim()) {
        return {
          answer: emitDegraded(runtime, NO_CONTEXT_MESSAGE),
          citations: [],
          answerSource: 'degraded',
        };
      }

      return { answer: text, citations, usage, answerSource: 'model' };
    }

    // Branch B: Web Search Grounding (0 chunks in document, web results available)
    if (state.webResults && state.webResults.length > 0) {
      const citations = webCitationsFrom(state.webResults);

      const { system, user } = buildWebSearchAnswerPrompt({
        question: state.question,
        webResults: state.webResults,
        documentName: runtime.ctx.documentName,
        conversation: runtime.conversation,
        persona: runtime.provider.systemPrompt,
      });

      const model = createChatModel(runtime.provider, { temperature: 0.2, maxTokens: 2048 });
      const { text, usage } = await streamAnswer(runtime, model, system, user);

      if (!text.trim()) {
        return {
          answer: emitDegraded(runtime, NO_CONTEXT_MESSAGE),
          citations: [],
          answerSource: 'degraded',
        };
      }

      return { answer: text, citations, usage, answerSource: 'web_search' };
    }

    // Branch C: Neither document chunks nor web results found
    return {
      answer: emitDegraded(runtime, NO_CONTEXT_MESSAGE),
      citations: [],
      answerSource: 'degraded',
    };
  };
