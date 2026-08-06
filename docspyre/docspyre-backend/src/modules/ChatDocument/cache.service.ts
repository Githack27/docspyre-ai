import { createHash } from 'node:crypto';
import { prisma } from '../../db/prisma';
import { indexerService } from './indexer.service';

export interface CachedResponse {
  answer: string;
  citations: any;
}

// Simple Jaccard similarity between two sets of tokens
function jaccardSimilarity(setA: Set<string>, setB: Set<string>): number {
  const intersection = new Set([...setA].filter(x => setB.has(x)));
  const union = new Set([...setA, ...setB]);
  if (union.size === 0) return 0;
  return intersection.size / union.size;
}

export const cacheService = {
  /**
   * Generates a stable hash for a query.
   */
  hashQuery(query: string): string {
    const q = query.trim().toLowerCase();
    const hash = createHash('sha256');
    return hash.update(q).digest('hex');
  },

  /**
   * Attempts to find a cached answer for a near-duplicate query in the target document or workspace.
   */
  async find(
    query: string,
    filters: { documentId?: string; workspaceId?: string }
  ): Promise<CachedResponse | null> {
    console.log(`[CacheService] Checking cache for query="${query}"`);

    const queryHash = this.hashQuery(query);
    const whereClause: any = {
      queryHash,
      documentId: filters.documentId ?? null,
      workspaceId: filters.workspaceId ?? null
    };

    // 1. Direct exact-hash match lookup (fastest)
    const exactMatch = await prisma.semanticCache.findFirst({
      where: whereClause
    });

    if (exactMatch) {
      console.log(`[CacheService] Cache hit (exact match)`);
      return {
        answer: exactMatch.answer,
        citations: exactMatch.citations
      };
    }

    // 2. Semantic matching: fetch recent cache entries in the same scope
    const recentCaches = await prisma.semanticCache.findMany({
      where: {
        documentId: filters.documentId ?? null,
        workspaceId: filters.workspaceId ?? null
      },
      orderBy: { createdAt: 'desc' },
      take: 20
    });

    const queryTokens = new Set(indexerService.tokenizeText(query));
    if (queryTokens.size === 0) return null;

    for (const cached of recentCaches) {
      const cachedTokens = new Set(indexerService.tokenizeText(cached.query));
      const similarity = jaccardSimilarity(queryTokens, cachedTokens);

      // Jaccard threshold: 85% overlap indicates near-duplicate semantically
      if (similarity >= 0.85) {
        console.log(`[CacheService] Cache hit (semantic similarity match: ${(similarity * 100).toFixed(0)}%)`);
        return {
          answer: cached.answer,
          citations: cached.citations
        };
      }
    }

    console.log(`[CacheService] Cache miss`);
    return null;
  },

  /**
   * Saves a response to the semantic cache.
   */
  async save(
    query: string,
    filters: { documentId?: string; workspaceId?: string },
    answer: string,
    citations: any
  ): Promise<void> {
    console.log(`[CacheService] Saving query to cache: "${query}"`);
    const queryHash = this.hashQuery(query);

    try {
      await prisma.semanticCache.create({
        data: {
          documentId: filters.documentId ?? null,
          workspaceId: filters.workspaceId ?? null,
          query,
          queryHash,
          answer,
          citations: citations as any
        }
      });
    } catch (e) {
      console.error(`[CacheService] Failed to write cache:`, e);
    }
  }
};
