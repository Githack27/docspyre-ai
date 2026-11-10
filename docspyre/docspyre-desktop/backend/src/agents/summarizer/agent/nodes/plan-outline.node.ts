import { db, eq, and, documents, documentSummaries, documentChunks, summarizerMemory } from '@docspyre/database';
import type { SummarizerStateType, OutlineData } from '../state';
import type { SummarizerRuntime } from '../runtime';
import { createChatModel } from '../../../chat-document/llm/model.factory';
import { messageText, extractJson } from '../../../chat-document/llm/output';
import { OUTLINE_PLANNER_SYSTEM, buildOutlinePrompt } from '../../prompts/summarizer.prompt';
import { logger } from '../../../../core/utils/logger';

export const planOutlineNode = (runtime: SummarizerRuntime) => {
  return async (state: SummarizerStateType): Promise<Partial<SummarizerStateType>> => {
    runtime.emit({
      type: 'status',
      phase: 'planning',
      message: 'Synthesizing document architecture and structuring comprehensive outline...',
    });

    const [doc] = await db
      .select({ name: documents.name })
      .from(documents)
      .where(eq(documents.id, state.documentId))
      .limit(1);

    const docName = doc?.name || 'Document';

    // Fetch precomputed document summary if available
    const [summaryRow] = await db
      .select({ summary: documentSummaries.summary })
      .from(documentSummaries)
      .where(and(eq(documentSummaries.documentId, state.documentId), eq(documentSummaries.scope, 'DOCUMENT')))
      .limit(1);

    // Fetch section summaries or unique section headings from chunks
    const sectionRows = await db
      .select({ sectionPath: documentChunks.sectionPath })
      .from(documentChunks)
      .where(eq(documentChunks.documentId, state.documentId))
      .limit(50);

    const headingsSet = new Set<string>();
    for (const r of sectionRows) {
      if (r.sectionPath?.length) {
        headingsSet.add(r.sectionPath.filter(Boolean).join(' > '));
      }
    }
    const sectionHeadings = Array.from(headingsSet).slice(0, 15);

    // Sample excerpts across document
    const sampleChunks = await db
      .select({ text: documentChunks.text })
      .from(documentChunks)
      .where(eq(documentChunks.documentId, state.documentId))
      .limit(6);

    const sampleExcerpts = sampleChunks.map((c) => c.text.slice(0, 800));

    let outline: OutlineData;

    if (runtime.provider) {
      try {
        const model = createChatModel(runtime.provider, { temperature: 0.2, maxTokens: 2500 });
        const prompt = buildOutlinePrompt({
          documentName: docName,
          format: state.format,
          customFocus: state.customFocus,
          summary: summaryRow?.summary,
          sectionHeadings,
          sampleExcerpts,
        });

        const res = await model.invoke([
          { role: 'system', content: OUTLINE_PLANNER_SYSTEM },
          { role: 'user', content: prompt },
        ]);

        const raw = messageText(res);
        const parsed = extractJson<OutlineData>(raw);

        if (parsed?.title && Array.isArray(parsed.sections) && parsed.sections.length > 0) {
          outline = parsed;
        } else {
          outline = buildDefaultOutline(docName, state.format, sectionHeadings);
        }
      } catch (err) {
        logger.warn('Model outline planning failed, using structured fallback', {
          error: err instanceof Error ? err.message : String(err),
        });
        outline = buildDefaultOutline(docName, state.format, sectionHeadings);
      }
    } else {
      outline = buildDefaultOutline(docName, state.format, sectionHeadings);
    }

    // Persist outline into DB summarizerMemory using state.memoryRefId
    if (state.memoryRefId) {
      await db
        .update(summarizerMemory)
        .set({
          outline,
          updatedAt: new Date(),
        })
        .where(eq(summarizerMemory.id, state.memoryRefId));
    }

    runtime.emit({
      type: 'outline',
      data: outline,
    });

    runtime.emit({
      type: 'status',
      phase: 'planning',
      message: `Outline established with ${outline.sections.length} core sections and table requirements.`,
    });

    return {
      title: outline.title,
      subtitle: outline.subtitle,
      outlineRef: outline.title,
      status: 'drafting',
    };
  };
};

function buildDefaultOutline(
  name: string,
  format: string,
  headings: string[],
): OutlineData {
  const sections = headings.length
    ? headings.map((h) => ({
        heading: h,
        subheadings: ['Overview', 'Key Specifications'],
        requiresTable: true,
        tableDescription: 'Key parameters and definitions',
        visualPrompt: `Diagram illustration of ${h}`,
      }))
    : [
        {
          heading: 'Executive Overview & Core Architecture',
          subheadings: ['Scope', 'Core Principles'],
          requiresTable: true,
          tableDescription: 'System properties and characteristics',
          visualPrompt: 'High-level system architecture and dataflow diagram',
        },
        {
          heading: 'Comprehensive Specifications & Analysis',
          subheadings: ['Detailed Analysis', 'Operational Rules'],
          requiresTable: true,
          tableDescription: 'Comparative matrix and evaluation',
          visualPrompt: 'Operational workflow and component relationship chart',
        },
        {
          heading: 'Key Takeaways & Actionable Guidance',
          subheadings: ['Best Practices', 'Checklist'],
          requiresTable: false,
        },
      ];

  return {
    title: `${name.replace(/\.[^/.]+$/, '')} — Master Manual`,
    subtitle: `A comprehensive ${format} and detailed technical guide`,
    sections,
  };
}
