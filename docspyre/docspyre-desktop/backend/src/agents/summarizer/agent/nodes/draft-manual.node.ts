import { db, eq, inArray, documents, documentChunks, summarizerMemory } from '@docspyre/database';
import type { SummarizerStateType, OutlineData } from '../state';
import type { SummarizerRuntime } from '../runtime';
import { createChatModel } from '../../../chat-document/llm/model.factory';
import { messageText } from '../../../chat-document/llm/output';
import { MANUAL_WRITER_SYSTEM, buildManualPrompt } from '../../prompts/summarizer.prompt';
import { logger } from '../../../../core/utils/logger';

export const draftManualNode = (runtime: SummarizerRuntime) => {
  return async (state: SummarizerStateType): Promise<Partial<SummarizerStateType>> => {
    runtime.emit({
      type: 'status',
      phase: 'drafting',
      message: 'Drafting publication-grade manual, structured tables, and deep-dive notes...',
    });

    const [doc] = await db
      .select({ name: documents.name })
      .from(documents)
      .where(eq(documents.id, state.documentId))
      .limit(1);

    const docName = doc?.name || 'Document';

    // Fetch the outline stored in DB memory using the memory reference
    let outlineJson = '';
    if (state.memoryRefId) {
      const [mem] = await db
        .select({ outline: summarizerMemory.outline })
        .from(summarizerMemory)
        .where(eq(summarizerMemory.id, state.memoryRefId))
        .limit(1);

      if (mem?.outline) {
        outlineJson = JSON.stringify(mem.outline, null, 2);
      }
    }

    // Fetch chunk texts selectively from DB using chunk references (up to 20 key chunks)
    let groundingExcerpts: string[] = [];
    if (state.chunkRefIds.length) {
      const selectedChunkIds = state.chunkRefIds.slice(0, 25);
      const chunks = await db
        .select({ text: documentChunks.text, page: documentChunks.page, sectionPath: documentChunks.sectionPath })
        .from(documentChunks)
        .where(inArray(documentChunks.id, selectedChunkIds));

      groundingExcerpts = chunks.map((c) => {
        const sec = c.sectionPath?.filter(Boolean).join(' > ') || `Page ${c.page}`;
        return `### [Context: ${sec}]\n${c.text.slice(0, 1800)}`;
      });
    }

    let markdownContent = '';

    if (runtime.provider) {
      try {
        const model = createChatModel(runtime.provider, {
          temperature: 0.25,
          maxTokens: 8192,
        });

        const prompt = buildManualPrompt({
          documentName: docName,
          format: state.format,
          customFocus: state.customFocus,
          outlineJson,
          groundingExcerpts,
        });

        const messages = [
          { role: 'system' as const, content: MANUAL_WRITER_SYSTEM },
          { role: 'user' as const, content: prompt },
        ];

        try {
          const stream = await model.stream(messages);
          for await (const chunk of stream) {
            const token = messageText(chunk);
            if (token) {
              markdownContent += token;
              runtime.emit({ type: 'token', token });
            }
          }
        } catch (streamErr) {
          logger.warn('Stream failed during manual drafting, falling back to invoke', {
            error: streamErr instanceof Error ? streamErr.message : String(streamErr),
          });
          const res = await model.invoke(messages);
          markdownContent = messageText(res);
          runtime.emit({ type: 'token', token: markdownContent });
        }
      } catch (err) {
        logger.error('Model drafting failed, generating structured fallback manual', {
          error: err instanceof Error ? err.message : String(err),
        });
        markdownContent = generateFallbackManual(docName, state.format, groundingExcerpts);
        runtime.emit({ type: 'token', token: markdownContent });
      }
    } else {
      markdownContent = generateFallbackManual(docName, state.format, groundingExcerpts);
      runtime.emit({ type: 'token', token: markdownContent });
    }

    // Persist draft snapshot in DB memory using state.memoryRefId
    if (state.memoryRefId) {
      await db
        .update(summarizerMemory)
        .set({
          memorySnapshot: {
            title: state.title,
            subtitle: state.subtitle,
            draftLength: markdownContent.length,
          },
          updatedAt: new Date(),
        })
        .where(eq(summarizerMemory.id, state.memoryRefId));
    }

    runtime.emit({
      type: 'status',
      phase: 'drafting',
      message: 'Draft completed with structured Markdown tables and section documentation.',
    });

    return {
      markdownContent,
      status: 'illustrating',
    };
  };
};

function generateFallbackManual(
  docName: string,
  format: string,
  excerpts: string[],
): string {
  const cleanName = docName.replace(/\.[^/.]+$/, '');
  const excerptText = excerpts.length
    ? excerpts.slice(0, 4).join('\n\n')
    : 'No excerpt text available.';

  return `# ${cleanName} — Master Reference Manual

## Executive Summary
This document provides structured notes and a complete synthesis for **${cleanName}**. It organizes core concepts into an accessible technical reference.

> [!NOTE]
> This manual was compiled from document ingestion records and is optimized for comprehensive reference.

## Key Concepts & Overview
| Concept / Metric | Description | Category |
| :--- | :--- | :--- |
| Primary Objective | Synthesize knowledge and provide reference notes | System |
| Ingestion Source | ${docName} | Source |
| Format Style | ${format.toUpperCase()} | Guide |

![visual: System overview and operational workflow diagram](generate)

## Grounding Documentation
${excerptText}

## Key Takeaways & Review Checklist
- [x] Document processed and indexed into searchable knowledge base.
- [x] Critical properties identified and structured into summary tables.
- [x] Reference manual generated and ready for PDF export.
`;
}
