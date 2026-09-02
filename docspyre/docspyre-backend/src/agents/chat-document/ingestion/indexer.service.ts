import { db, eq, documentChunks } from '@docspyre/database';
import { logger } from '../../../core/utils/logger';
import { embeddingService } from '../retrieval/embedding.service';
import type { ResolvedProvider } from '../llm/provider-resolver.service';
import type { DocumentChunkDraft } from './chunker.service';

/** Embedding requests per batch; keeps payloads under provider limits. */
const EMBED_BATCH_SIZE = 32;
/** Rows per insert statement. */
const INSERT_BATCH_SIZE = 100;
/** Keyword cap per chunk for the BM25 side of retrieval. */
const MAX_KEYWORDS = 30;

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have',
  'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may',
  'might', 'shall', 'can', 'of', 'in', 'to', 'for', 'with', 'on', 'at', 'from',
  'by', 'as', 'into', 'through', 'during', 'before', 'after', 'above', 'below',
  'between', 'and', 'but', 'or', 'nor', 'not', 'so', 'yet', 'both', 'either',
  'neither', 'each', 'every', 'all', 'any', 'few', 'more', 'most', 'other',
  'some', 'such', 'no', 'only', 'same', 'than', 'too', 'very', 'just', 'this',
  'that', 'these', 'those', 'it', 'its', 'their', 'them', 'they', 'we', 'our',
]);

/**
 * Frequency-ranked content words. Kept as an array so Postgres can prefilter
 * candidates with an array-overlap operator before any scoring happens.
 */
const extractKeywords = (text: string): string[] => {
  const frequencies = new Map<string, number>();

  for (const token of text.toLowerCase().split(/\W+/)) {
    if (token.length <= 2 || STOP_WORDS.has(token)) continue;
    frequencies.set(token, (frequencies.get(token) ?? 0) + 1);
  }

  return [...frequencies.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_KEYWORDS)
    .map(([token]) => token);
};

const chunked = <T>(items: T[], size: number): T[][] => {
  const batches: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    batches.push(items.slice(i, i + size));
  }
  return batches;
};

export const indexerService = {
  /**
   * Embeds and stores chunks, replacing any previous index for the document.
   *
   * The embedding model id is stored per row so the retriever can guarantee it
   * only compares vectors produced by the same model.
   */
  async index(
    documentId: string,
    chunks: DocumentChunkDraft[],
    provider: ResolvedProvider | null,
  ): Promise<void> {
    // Re-indexing must not leave stale vectors behind.
    await db.delete(documentChunks).where(eq(documentChunks.documentId, documentId));

    if (!chunks.length) return;

    const model = await embeddingService.resolve(provider);
    const embeddings: number[][] = [];

    for (const batch of chunked(chunks, EMBED_BATCH_SIZE)) {
      try {
        const vectors = await model.embed(batch.map((chunk) => chunk.text));
        embeddings.push(...vectors);
      } catch (error) {
        logger.warn('Embedding batch failed, using local fallback for this batch', {
          documentId,
          error: error instanceof Error ? error.message : String(error),
        });
        embeddings.push(...(await embeddingService.localModel.embed(batch.map((c) => c.text))));
      }
    }

    const rows = chunks.map((chunk, index) => {
      const embedding = embeddings[index] ?? [];

      return {
        documentId: chunk.documentId,
        chunkId: chunk.chunkId,
        parentChunkId: chunk.parentChunkId,
        page: chunk.page,
        sectionPath: chunk.sectionPath,
        bbox: chunk.bbox,
        chunkType: chunk.chunkType,
        text: chunk.text,
        embedding,
        keywords: extractKeywords(chunk.text),
        // Mixed models across one document would break dense scoring, so record
        // what actually produced each vector.
        embeddingModel: embedding.length === model.dim ? model.id : embeddingService.localModel.id,
        embeddingDim: embedding.length,
      };
    });

    for (const batch of chunked(rows, INSERT_BATCH_SIZE)) {
      await db.insert(documentChunks).values(batch);
    }

    logger.info('Document indexed', {
      documentId,
      chunks: rows.length,
      embeddingModel: model.id,
    });
  },
};
