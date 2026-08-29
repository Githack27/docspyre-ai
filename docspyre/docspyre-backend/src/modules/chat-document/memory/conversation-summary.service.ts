import { db, eq, asc, chatMessages, conversationSummaries } from '@docspyre/database';
import { env } from '../../../core/config';
import { logger } from '../../../core/utils/logger';
import { createChatModel, describeModel } from '../llm/model.factory';
import { messageText } from '../llm/output';
import type { ResolvedProvider } from '../llm/provider-resolver.service';
import { CONVERSATION_SUMMARY_SYSTEM, buildConversationSummaryPrompt } from '../agent/prompts';

export interface ConversationTurn {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * Bounded view of a conversation: a prose summary of everything older than the
 * retained window, plus the most recent turns verbatim.
 */
export interface ConversationContext {
  summary: string | null;
  recentTurns: ConversationTurn[];
}

export const EMPTY_CONVERSATION: ConversationContext = { summary: null, recentTurns: [] };

/** Keeps a single turn from dominating the prompt. */
const TURN_CHAR_CAP = 1_500;

const trimTurn = (content: string): string =>
  content.length > TURN_CHAR_CAP ? `${content.slice(0, TURN_CHAR_CAP)}…` : content;

export const conversationSummaryService = {
  /**
   * Loads bounded history for a session. `excludeMessageId` lets the caller drop
   * the message currently being answered so it is not duplicated in the prompt.
   */
  async getContext(sessionId: string, excludeMessageId?: string): Promise<ConversationContext> {
    const [stored] = await db
      .select()
      .from(conversationSummaries)
      .where(eq(conversationSummaries.sessionId, sessionId))
      .limit(1);

    const messages = await db
      .select({
        id: chatMessages.id,
        role: chatMessages.role,
        content: chatMessages.content,
      })
      .from(chatMessages)
      .where(eq(chatMessages.sessionId, sessionId))
      .orderBy(asc(chatMessages.createdAt));

    const conversational = messages.filter(
      (message) =>
        message.id !== excludeMessageId &&
        (message.role === 'user' || message.role === 'assistant') &&
        message.content.trim().length > 0,
    );

    // Everything already folded into the summary is dropped from the window.
    let windowStart = 0;
    if (stored?.throughMessageId) {
      const foldedIndex = conversational.findIndex(
        (message) => message.id === stored.throughMessageId,
      );
      if (foldedIndex >= 0) windowStart = foldedIndex + 1;
    }

    const recent = conversational
      .slice(windowStart)
      .slice(-env.AGENT_HISTORY_TURNS)
      .map((message) => ({
        role: message.role as 'user' | 'assistant',
        content: trimTurn(message.content),
      }));

    return { summary: stored?.summary ?? null, recentTurns: recent };
  },

  /**
   * Folds turns that fell outside the retained window into the rolling summary.
   * Runs after a turn completes so it never adds latency to the answer, and is
   * a no-op until the session grows past the configured threshold.
   */
  async maybeCompact(sessionId: string, provider: ResolvedProvider | null): Promise<void> {
    if (!provider) return;

    const messages = await db
      .select({
        id: chatMessages.id,
        role: chatMessages.role,
        content: chatMessages.content,
        createdAt: chatMessages.createdAt,
      })
      .from(chatMessages)
      .where(eq(chatMessages.sessionId, sessionId))
      .orderBy(asc(chatMessages.createdAt));

    const conversational = messages.filter(
      (message) =>
        (message.role === 'user' || message.role === 'assistant') &&
        message.content.trim().length > 0,
    );

    if (conversational.length < env.AGENT_SUMMARY_THRESHOLD) return;

    const [stored] = await db
      .select()
      .from(conversationSummaries)
      .where(eq(conversationSummaries.sessionId, sessionId))
      .limit(1);

    let foldedThrough = 0;
    if (stored?.throughMessageId) {
      const index = conversational.findIndex((message) => message.id === stored.throughMessageId);
      if (index >= 0) foldedThrough = index + 1;
    }

    // Fold everything except the turns that must stay verbatim.
    const foldUpTo = conversational.length - env.AGENT_HISTORY_TURNS;
    const pending = conversational.slice(foldedThrough, Math.max(foldedThrough, foldUpTo));

    if (pending.length < 2) return;

    const lastFolded = pending[pending.length - 1];
    if (!lastFolded) return;

    try {
      const model = createChatModel(provider, { temperature: 0.2, maxTokens: 600 });
      const response = await model.invoke([
        { role: 'system', content: CONVERSATION_SUMMARY_SYSTEM },
        {
          role: 'user',
          content: buildConversationSummaryPrompt({
            existingSummary: stored?.summary ?? null,
            turns: pending.map((message) => ({
              role: message.role,
              content: trimTurn(message.content),
            })),
          }),
        },
      ]);

      const summary = messageText(response).trim();
      if (!summary) return;

      const payload = {
        summary,
        throughMessageId: lastFolded.id,
        messageCount: foldedThrough + pending.length,
        tokenCount: Math.ceil(summary.length / 4),
        model: describeModel(provider),
      };

      if (stored) {
        await db
          .update(conversationSummaries)
          .set(payload)
          .where(eq(conversationSummaries.sessionId, sessionId));
      } else {
        await db.insert(conversationSummaries).values({ sessionId, ...payload });
      }

      logger.debug('Conversation summary updated', {
        sessionId,
        foldedTurns: pending.length,
      });
    } catch (error) {
      // A stale summary is acceptable; the next turn retries.
      logger.debug('Conversation compaction skipped', {
        sessionId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  },
};
