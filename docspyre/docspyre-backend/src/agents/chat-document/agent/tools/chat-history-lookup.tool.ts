import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { db, eq, asc, chatMessages } from '@docspyre/database';
import { recordToolCall, type AgentToolContext } from './context';

const schema = z.object({
  query: z
    .string()
    .optional()
    .describe('Optional search keyword to filter previous conversation messages.'),
  limit: z
    .number()
    .int()
    .min(1)
    .max(50)
    .optional()
    .describe('Maximum number of previous turns to inspect (default: 20).'),
});

/**
 * Read-only lookup tool allowing the agent in a chained chat session to inspect
 * the full verbatim history of the previous session.
 */
export const createChatHistoryLookupTool = (ctx: AgentToolContext) =>
  tool(
    async ({ query, limit }) =>
      recordToolCall(ctx, 'lookup_previous_chat_history', { query, limit }, async () => {
        if (!ctx.previousSessionId) {
          return {
            result: 'There is no previous chat session linked to this conversation.',
            summary: 'No previous session linked',
          };
        }

        const max = limit || 20;

        const rows = await db
          .select({
            role: chatMessages.role,
            content: chatMessages.content,
            createdAt: chatMessages.createdAt,
          })
          .from(chatMessages)
          .where(eq(chatMessages.sessionId, ctx.previousSessionId))
          .orderBy(asc(chatMessages.createdAt));

        let filtered = rows;
        if (query && query.trim()) {
          const lower = query.toLowerCase();
          filtered = rows.filter((r) => r.content.toLowerCase().includes(lower));
        }

        const selected = filtered.slice(-max);
        ctx.artifacts.previousChatExcerpts = selected.map((s) => ({
          role: s.role,
          content: s.content,
        }));

        if (!selected.length) {
          return {
            result: query
              ? `No messages in the previous chat session matched "${query}".`
              : 'The previous chat session contains no messages.',
            summary: '0 previous messages matched',
          };
        }

        const rendered = selected
          .map(
            (msg) =>
              `${msg.role === 'user' ? 'User' : 'Assistant'} (${new Date(msg.createdAt).toLocaleTimeString()}):\n${msg.content}`,
          )
          .join('\n\n---\n\n');

        return {
          result: `## Previous Chat History Excerpt:\n\n${rendered}`,
          summary: `Retrieved ${selected.length} message(s) from previous session`,
        };
      }),
    {
      name: 'lookup_previous_chat_history',
      description:
        'Read-only lookup to inspect verbatim messages from the previous chat session when in a continued chat.',
      schema,
    },
  );
