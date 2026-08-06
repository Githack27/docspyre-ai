import { randomUUID } from 'node:crypto';
import type { IRBlock } from './parser.service';

export interface Chunk {
  chunk_id: string;
  doc_id: string;
  parent_chunk_id: string | null;
  page: number;
  section_path: string[];
  bbox: [number, number, number, number];
  chunk_type: string; // 'parent' | 'child'
  block_type: 'heading' | 'paragraph' | 'table' | 'footnote' | 'list_item';
  text: string;
}

// Rough approximation: 1 word ≈ 1.3 tokens, 1 token ≈ 4.5 characters
function countTokens(text: string): number {
  return Math.ceil(text.split(/\s+/).filter(Boolean).length * 1.3);
}

export const chunkerService = {
  /**
   * Performs hierarchical chunking on a Unified IR block list.
   * Returns a list of chunks (both parent and child chunks).
   */
  chunkDocument(docId: string, blocks: IRBlock[]): Chunk[] {
    console.log(`[ChunkerService] Starting chunking for docId=${docId}, total blocks=${blocks.length}`);
    const result: Chunk[] = [];

    // Group blocks by sections to keep semantic cohesion
    const sections: { pathKey: string; blocks: IRBlock[] }[] = [];
    for (const block of blocks) {
      const pathKey = block.section_path.join(' > ') || 'Root';
      let section = sections.find(s => s.pathKey === pathKey);
      if (!section) {
        section = { pathKey, blocks: [] };
        sections.push(section);
      }
      section.blocks.push(block);
    }

    for (const section of sections) {
      let currentParentBlocks: IRBlock[] = [];
      let currentParentTokenCount = 0;

      for (let i = 0; i < section.blocks.length; i++) {
        const block = section.blocks[i];
        if (!block) continue;

        const blockTokens = countTokens(block.text);

        // Rule 1: Tables are their own parent and child chunks, never split.
        if (block.type === 'table') {
          // Flush existing parent if there is one
          if (currentParentBlocks.length > 0) {
            this.createHierarchicalChunks(docId, currentParentBlocks, result);
            currentParentBlocks = [];
            currentParentTokenCount = 0;
          }

          // Create table chunk
          const tableParentId = randomUUID();
          const tableText = block.text;
          
          // Add Parent Table Chunk
          result.push({
            chunk_id: tableParentId,
            doc_id: docId,
            parent_chunk_id: null,
            page: block.page,
            section_path: block.section_path,
            bbox: block.bbox,
            chunk_type: 'parent',
            block_type: 'table',
            text: tableText
          });

          // Add Child Table Chunk (same ID, linked, for retrieval)
          result.push({
            chunk_id: randomUUID(),
            doc_id: docId,
            parent_chunk_id: tableParentId,
            page: block.page,
            section_path: block.section_path,
            bbox: block.bbox,
            chunk_type: 'child',
            block_type: 'table',
            text: tableText
          });

          continue;
        }

        // Parent chunk token limit: 1000 - 1500 tokens (approx 1200 threshold)
        if (currentParentTokenCount + blockTokens > 1200 && currentParentBlocks.length > 0) {
          this.createHierarchicalChunks(docId, currentParentBlocks, result);
          currentParentBlocks = [];
          currentParentTokenCount = 0;
        }

        currentParentBlocks.push(block);
        currentParentTokenCount += blockTokens;
      }

      // Flush remaining blocks in this section
      if (currentParentBlocks.length > 0) {
        this.createHierarchicalChunks(docId, currentParentBlocks, result);
      }
    }

    console.log(`[ChunkerService] Chunking complete. Generated total chunks=${result.length}`);
    return result;
  },

  /**
   * Helper that builds one parent chunk and splits it into child chunks (200-400 tokens).
   */
  createHierarchicalChunks(docId: string, blocks: IRBlock[], resultList: Chunk[]): void {
    if (blocks.length === 0) return;
    
    const parentId = randomUUID();
    const primaryBlock = blocks[0];
    if (!primaryBlock) return;
    
    // Aggregate text
    const parentText = blocks.map(b => b.text).join('\n\n');
    const firstBbox = primaryBlock.bbox;
    const lastBlock = blocks[blocks.length - 1];
    const lastBbox = lastBlock ? lastBlock.bbox : primaryBlock.bbox;
    const bbox: [number, number, number, number] = [
      firstBbox[0],
      firstBbox[1],
      lastBbox[2],
      lastBbox[3]
    ];

    const blockType = primaryBlock.type === 'image' ? 'paragraph' : primaryBlock.type;

    // 1. Create and add parent chunk
    resultList.push({
      chunk_id: parentId,
      doc_id: docId,
      parent_chunk_id: null,
      page: primaryBlock.page,
      section_path: primaryBlock.section_path,
      bbox,
      chunk_type: 'parent',
      block_type: blockType,
      text: parentText
    });

    // 2. Create child chunks (200-400 tokens)
    let currentChildText: string[] = [];
    let currentChildTokenCount = 0;
    let childBlocks: IRBlock[] = [];

    for (const block of blocks) {
      if (!block) continue;
      const blockTokens = countTokens(block.text);

      if (currentChildTokenCount + blockTokens > 300 && currentChildText.length > 0) {
        this.flushChild(docId, parentId, childBlocks, currentChildText.join('\n\n'), resultList);
        currentChildText = [];
        currentChildTokenCount = 0;
        childBlocks = [];
      }

      currentChildText.push(block.text);
      currentChildTokenCount += blockTokens;
      childBlocks.push(block);
    }

    if (currentChildText.length > 0) {
      this.flushChild(docId, parentId, childBlocks, currentChildText.join('\n\n'), resultList);
    }
  },

  flushChild(
    docId: string,
    parentId: string,
    blocks: IRBlock[],
    text: string,
    resultList: Chunk[]
  ): void {
    if (blocks.length === 0) return;
    const primaryBlock = blocks[0];
    if (!primaryBlock) return;
    
    const firstBbox = primaryBlock.bbox;
    const lastBlock = blocks[blocks.length - 1];
    const lastBbox = lastBlock ? lastBlock.bbox : primaryBlock.bbox;
    const bbox: [number, number, number, number] = [
      firstBbox[0],
      firstBbox[1],
      lastBbox[2],
      lastBbox[3]
    ];

    const blockType = primaryBlock.type === 'image' ? 'paragraph' : primaryBlock.type;

    resultList.push({
      chunk_id: randomUUID(),
      doc_id: docId,
      parent_chunk_id: parentId,
      page: primaryBlock.page,
      section_path: primaryBlock.section_path,
      bbox,
      chunk_type: 'child',
      block_type: blockType,
      text
    });
  }
};
