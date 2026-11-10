import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { retrieverService } from '../../retrieval/retriever.service';
import { recordToolCall, type AgentToolContext } from './context';

const schema = z.object({
  query: z
    .string()
    .min(1)
    .describe('Search phrase. Use the user\'s wording plus any disambiguating terms from context.'),
  topK: z
    .number()
    .int()
    .min(1)
    .max(20)
    .optional()
    .describe('Number of excerpts to return. Defaults to the configured value.'),
});

/**
 * Hybrid search over the indexed excerpts of the documents in scope.
 *
 * Returns numbered excerpts for the model and stashes the structured chunks on
 * the context so citations can be built with page and bounding-box data.
 */
export const createSearchDocumentTool = (ctx: AgentToolContext) =>
  tool(
    async ({ query, topK }) =>
      recordToolCall(ctx, 'search_document', { query, topK }, async () => {
        const result = await retrieverService.retrieve({
          query,
          filters: {
            documentId: ctx.documentId ?? undefined,
            workspaceId: ctx.workspaceId ?? undefined,
          },
          topK,
          provider: ctx.provider,
        });

        // Later searches within one turn accumulate, de-duplicated by chunk id.
        const seen = new Set(ctx.artifacts.chunks.map((chunk) => chunk.chunk_id));
        for (const chunk of result.chunks) {
          if (!seen.has(chunk.chunk_id)) {
            ctx.artifacts.chunks.push(chunk);
            seen.add(chunk.chunk_id);
          }
        }
        ctx.artifacts.retrievalMode = result.mode;

        if (!result.chunks.length) {
          return {
            result: 'No excerpts matched that search.',
            summary: `0 excerpts (mode=${result.mode})`,
          };
        }

        const rendered = result.chunks
          .map((chunk, index) => {
            const section = chunk.section_path?.filter(Boolean).join(' > ');
            const label = section ? ` — ${section}` : '';
            return `[${index + 1}] (page ${chunk.page}${label})\n${chunk.parent_text || chunk.text}`;
          })
          .join('\n\n');

        return {
          result: rendered,
          summary: `${result.chunks.length} excerpts (mode=${result.mode}, candidates=${result.candidateCount})`,
        };
      }),
    {
      name: 'search_document',
      description:
        'Search the user\'s documents for passages relevant to a question. Use this before answering any question about document content.',
      schema,
    },
  );
