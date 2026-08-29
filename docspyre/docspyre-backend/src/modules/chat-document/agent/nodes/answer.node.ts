import { createChatModel } from '../../llm/model.factory';
import { summarizerService } from '../../ingestion/summarizer.service';
import { buildDocumentQaPrompt } from '../prompts';
import { streamAnswer, emitDegraded, type AgentRuntime } from '../runtime';
import { citationsFrom, type AgentStateType, type AgentStateUpdate } from '../state';

const NO_MODEL_MESSAGE =
  'I cannot reach a language model right now, so I am unable to answer from the document. Add an AI provider key in Settings, or try again shortly.';

const NO_CONTEXT_MESSAGE =
  'I could not find anything in this document that addresses that. Could you rephrase it, or point me at a section or term you expect it to appear under?';

/**
 * Produces the grounded answer for the document QA branch.
 *
 * Citations only cover chunks that were actually supplied as context, so a
 * citation marker can never point at something the model did not see.
 */
export const answerNode = (runtime: AgentRuntime) =>
  async (state: AgentStateType): Promise<AgentStateUpdate> => {
    const citations = citationsFrom(state.chunks);

    if (!runtime.provider) {
      return {
        answer: emitDegraded(runtime, NO_MODEL_MESSAGE),
        citations: [],
        answerSource: 'degraded',
      };
    }

    // With no grounding there is nothing to answer from; say so rather than
    // letting the model improvise.
    if (!state.chunks.length) {
      return {
        answer: emitDegraded(runtime, NO_CONTEXT_MESSAGE),
        citations: [],
        answerSource: 'degraded',
      };
    }

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
  };
