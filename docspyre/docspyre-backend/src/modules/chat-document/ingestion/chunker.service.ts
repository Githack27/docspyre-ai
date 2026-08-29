import type { ParsedBlock } from './parser.service';

export interface DocumentChunkDraft {
  chunkId: string;
  parentChunkId: string | null;
  documentId: string;
  page: number;
  sectionPath: string[];
  bbox: number[];
  chunkType: 'parent' | 'child';
  text: string;
}

/** Rough token estimate; 4 characters per token is close enough for budgeting. */
const estimateTokens = (text: string): number => Math.ceil(text.length / 4);

const CHILD_MAX_TOKENS = 350;
const PARENT_MAX_TOKENS = 1_200;

/**
 * Hierarchical chunking.
 *
 * Child chunks are small enough to rank precisely; parent chunks give the model
 * enough surrounding text to answer. The retriever matches on children and
 * expands to parents, which avoids the usual trade-off between retrieval
 * precision and answer completeness.
 */
export const chunkerService = {
  chunk(blocks: ParsedBlock[], documentId: string): DocumentChunkDraft[] {
    const chunks: DocumentChunkDraft[] = [];
    let counter = 0;
    const nextId = (): string => `c${(counter += 1)}`;

    // Group consecutive blocks that share a heading trail.
    const groups: { page: number; sectionPath: string[]; text: string }[] = [];

    for (const block of blocks) {
      if (!block.text.trim()) continue;

      const key = block.sectionPath.join(' > ');
      const previous = groups[groups.length - 1];

      if (previous && previous.sectionPath.join(' > ') === key) {
        previous.text = `${previous.text}\n\n${block.text}`;
      } else {
        groups.push({ page: block.page, sectionPath: block.sectionPath, text: block.text });
      }
    }

    for (const group of groups) {
      const sentences = group.text.split(/(?<=[.!?])\s+/).filter(Boolean);

      let parentId: string | null = null;
      let parentText = '';
      let childText = '';

      const flushParent = (): void => {
        if (!parentId || !parentText.trim()) return;

        chunks.push({
          chunkId: parentId,
          parentChunkId: null,
          documentId,
          page: group.page,
          sectionPath: group.sectionPath,
          bbox: [],
          chunkType: 'parent',
          text: parentText.trim(),
        });

        parentId = null;
        parentText = '';
      };

      const flushChild = (): void => {
        if (!childText.trim()) return;

        if (!parentId) parentId = nextId();

        parentText = parentText ? `${parentText} ${childText}` : childText;

        chunks.push({
          chunkId: nextId(),
          parentChunkId: parentId,
          documentId,
          page: group.page,
          sectionPath: group.sectionPath,
          bbox: [],
          chunkType: 'child',
          text: childText.trim(),
        });

        childText = '';

        if (estimateTokens(parentText) >= PARENT_MAX_TOKENS) flushParent();
      };

      for (const sentence of sentences) {
        childText = childText ? `${childText} ${sentence}` : sentence;
        if (estimateTokens(childText) >= CHILD_MAX_TOKENS) flushChild();
      }

      flushChild();
      flushParent();
    }

    return chunks;
  },
};
