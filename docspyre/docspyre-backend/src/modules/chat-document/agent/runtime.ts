import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { logger } from '../../../core/utils/logger';
import { messageText } from '../llm/output';
import type { ResolvedProvider } from '../llm/provider-resolver.service';
import type { ConversationContext } from '../memory/conversation-summary.service';
import type { AgentToolContext, AgentTools } from './tools';
import type { AgentRoute } from './prompts';
import type { TokenUsage } from './state';

/**
 * Events emitted while the graph runs. The controller translates these into SSE
 * frames; `token` matches the existing client contract exactly.
 */
export type AgentStreamEvent =
  | { type: 'token'; token: string }
  | { type: 'route'; route: AgentRoute }
  | { type: 'tool'; tool: string; summary: string }
  | { type: 'sql'; sql: string; attempt: number }
  | { type: 'notice'; message: string };

/** Per-request dependencies handed to every node. */
export interface AgentRuntime {
  ctx: AgentToolContext;
  tools: AgentTools;
  provider: ResolvedProvider | null;
  conversation: ConversationContext;
  emit: (event: AgentStreamEvent) => void;
}

export interface StreamedAnswer {
  text: string;
  usage: TokenUsage;
}

/**
 * Streams a model response to the client while accumulating the full text.
 *
 * Falls back to a single non-streaming call if the provider cannot stream, so a
 * transport limitation degrades latency rather than breaking the turn.
 */
export const streamAnswer = async (
  runtime: AgentRuntime,
  model: BaseChatModel,
  system: string,
  user: string,
): Promise<StreamedAnswer> => {
  const messages = [
    { role: 'system' as const, content: system },
    { role: 'user' as const, content: user },
  ];

  let text = '';
  const usage: TokenUsage = { promptTokens: null, completionTokens: null };

  try {
    const stream = await model.stream(messages);

    for await (const chunk of stream) {
      const piece = messageText(chunk);
      if (piece) {
        text += piece;
        runtime.emit({ type: 'token', token: piece });
      }

      const meta = (chunk as { usage_metadata?: { input_tokens?: number; output_tokens?: number } })
        .usage_metadata;
      if (meta) {
        usage.promptTokens = meta.input_tokens ?? usage.promptTokens;
        usage.completionTokens = meta.output_tokens ?? usage.completionTokens;
      }
    }

    if (text.trim()) return { text, usage };
    logger.debug('Model stream produced no text, retrying without streaming');
  } catch (error) {
    logger.warn('Model streaming failed, falling back to single call', {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  const response = await model.invoke(messages);
  const full = messageText(response);

  if (full) runtime.emit({ type: 'token', token: full });

  const meta = (response as { usage_metadata?: { input_tokens?: number; output_tokens?: number } })
    .usage_metadata;

  return {
    text: full,
    usage: {
      promptTokens: meta?.input_tokens ?? usage.promptTokens,
      completionTokens: meta?.output_tokens ?? usage.completionTokens,
    },
  };
};

/** Emits the fixed message used when no model can be reached at all. */
export const emitDegraded = (runtime: AgentRuntime, message: string): string => {
  runtime.emit({ type: 'token', token: message });
  return message;
};
