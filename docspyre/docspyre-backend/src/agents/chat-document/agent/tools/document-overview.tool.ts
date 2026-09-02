import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { summarizerService } from '../../ingestion/summarizer.service';
import { recordToolCall, type AgentToolContext } from './context';

const schema = z.object({
  includeSections: z
    .boolean()
    .optional()
    .describe('Include per-section summaries as well as the document-level overview.'),
});

/**
 * Reads pre-computed summaries instead of raw excerpts. Answering "what is this
 * about" from summaries costs a fraction of stuffing the document into context
 * and gives whole-file coverage that top-k retrieval cannot.
 */
export const createDocumentOverviewTool = (ctx: AgentToolContext) =>
  tool(
    async ({ includeSections }) =>
      recordToolCall(ctx, 'document_overview', { includeSections }, async () => {
        if (!ctx.documentId) {
          return { result: 'No single document is in scope.', summary: 'no document in scope' };
        }

        const overview = await summarizerService.getDocumentSummary(ctx.documentId);

        if (!overview) {
          return {
            result: 'No summary has been generated for this document yet.',
            summary: 'no summary available',
          };
        }

        const blocks: string[] = [`Summary:\n${overview.summary}`];

        if (overview.keyPoints.length) {
          blocks.push(`Key points:\n${overview.keyPoints.map((p) => `- ${p}`).join('\n')}`);
        }

        if (overview.entities.length) {
          blocks.push(`Entities: ${overview.entities.join(', ')}`);
        }

        let sectionCount = 0;
        if (includeSections) {
          const sections = await summarizerService.getSectionSummaries(ctx.documentId);
          sectionCount = sections.length;

          if (sections.length) {
            blocks.push(
              `Sections:\n${sections.map((s) => `- ${s.heading}: ${s.summary}`).join('\n')}`,
            );
          }
        }

        return {
          result: blocks.join('\n\n'),
          summary: `overview loaded (${sectionCount} sections)`,
        };
      }),
    {
      name: 'document_overview',
      description:
        'Read the pre-computed summary, key points and section summaries for the document in scope. Use for summary and "what is this about" requests instead of searching.',
      schema,
    },
  );
