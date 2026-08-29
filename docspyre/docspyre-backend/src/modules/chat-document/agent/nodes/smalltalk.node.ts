import { createChatModel } from '../../llm/model.factory';
import { buildSmalltalkPrompt } from '../prompts';
import { streamAnswer, emitDegraded, type AgentRuntime } from '../runtime';
import type { AgentStateType, AgentStateUpdate } from '../state';

const FALLBACK = 'I can answer questions about the file you have open. What would you like to know about it?';

/**
 * Handles greetings and capability questions without touching the document.
 *
 * Retrieval is deliberately skipped: pulling excerpts for "hi" is what produces
 * answers that ignore what the user actually said.
 */
export const smalltalkNode = (runtime: AgentRuntime) =>
  async (state: AgentStateType): Promise<AgentStateUpdate> => {
    if (!runtime.provider) {
      return { answer: emitDegraded(runtime, FALLBACK), answerSource: 'smalltalk' };
    }

    const { system, user } = buildSmalltalkPrompt({
      question: state.question,
      documentName: runtime.ctx.documentName,
      hasDataset: runtime.ctx.datasetSources.length > 0,
      conversation: runtime.conversation,
      persona: runtime.provider.systemPrompt,
    });

    const model = createChatModel(runtime.provider, { temperature: 0.4, maxTokens: 300 });
    const { text, usage } = await streamAnswer(runtime, model, system, user);

    return {
      answer: text.trim() || emitDegraded(runtime, FALLBACK),
      usage,
      answerSource: 'smalltalk',
      citations: [],
      verification: { status: 'skipped', claims: [] },
    };
  };
