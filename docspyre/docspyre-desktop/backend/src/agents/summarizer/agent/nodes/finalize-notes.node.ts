import { randomUUID } from 'node:crypto';
import { db, eq, documentNotes, summarizerMemory } from '@docspyre/database';
import type { SummarizerStateType } from '../state';
import type { SummarizerRuntime } from '../runtime';
import { logger } from '../../../../core/utils/logger';

export const finalizeNotesNode = (runtime: SummarizerRuntime) => {
  return async (state: SummarizerStateType): Promise<Partial<SummarizerStateType>> => {
    runtime.emit({
      type: 'status',
      phase: 'finalizing',
      message: 'Compiling structured manual, persisting to database, and finalizing notes...',
    });

    const noteId = randomUUID();
    const sections = parseMarkdownSections(state.markdownContent);

    // Save final manual & notes in document_notes table
    const [createdNote] = await db
      .insert(documentNotes)
      .values({
        id: noteId,
        documentId: state.documentId,
        userId: state.userId,
        workspaceId: state.workspaceId,
        title: state.title || 'Comprehensive Document Manual',
        subtitle: state.subtitle || 'Technical reference and study notes',
        format: state.format,
        content: state.markdownContent,
        sections,
        images: state.images,
        metadata: {
          chunkRefCount: state.chunkRefIds.length,
          imageCount: state.images.length,
          model: runtime.provider?.model || 'default',
        },
      })
      .returning();

    // Update summarizer memory in DB with the final note reference and snapshot
    if (state.memoryRefId) {
      await db
        .update(summarizerMemory)
        .set({
          memorySnapshot: {
            noteId,
            title: state.title,
            sectionCount: sections.length,
            completedAt: new Date().toISOString(),
          },
          updatedAt: new Date(),
        })
        .where(eq(summarizerMemory.id, state.memoryRefId));
    }

    logger.info('Summarizer agent successfully persisted manual in DB', {
      noteId,
      documentId: state.documentId,
      imagesCount: state.images.length,
    });

    runtime.emit({
      type: 'done',
      note: createdNote,
    });

    return {
      noteId,
      status: 'completed',
    };
  };
};

function parseMarkdownSections(markdown: string): Array<{ heading: string; level: number; content: string }> {
  const lines = markdown.split('\n');
  const sections: Array<{ heading: string; level: number; content: string }> = [];
  let currentHeading = 'Introduction';
  let currentLevel = 1;
  let currentLines: string[] = [];

  for (const line of lines) {
    const match = line.match(/^(#{1,4})\s+(.*)$/);
    if (match && match[1] && match[2]) {
      if (currentLines.length) {
        sections.push({
          heading: currentHeading,
          level: currentLevel,
          content: currentLines.join('\n').trim(),
        });
        currentLines = [];
      }
      currentLevel = match[1].length;
      currentHeading = match[2].trim();
    } else {
      currentLines.push(line);
    }
  }

  if (currentLines.length) {
    sections.push({
      heading: currentHeading,
      level: currentLevel,
      content: currentLines.join('\n').trim(),
    });
  }

  return sections;
}
