import { createHash } from 'node:crypto';
import { prisma } from '../../db/prisma';

export interface CachedResponse {
  answer: string;
  citations: any;
}

// Track whether the semantic_caches table exists to avoid repeated error logs
let cacheTableAvailable: boolean | null = null;

async function isCacheTableReady(): Promise<boolean> {
  if (cacheTableAvailable === true) return true;

  try {
    const result: any[] = await (prisma as any).$queryRawUnsafe(
      `SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'semantic_caches') AS "exists"`
    );
    cacheTableAvailable = result[0]?.exists === true;
  } catch {
    cacheTableAvailable = false;
  }

  return cacheTableAvailable ?? false;
}

export const cacheService = {
  /**
   * Normalises a query into a stable cache identity. Only whitespace and case
   * are collapsed — no stemming or stop-word removal, because those are lossy
   * and would make semantically different questions share a key.
   */
  hashQuery(query: string): string {
    const q = query.trim().toLowerCase().replace(/\s+/g, ' ');
    const hash = createHash('sha256');
    return hash.update(q).digest('hex');
  },

  /**
   * Looks up a previously generated answer for the *same* question in the same
   * scope.
   *
   * Deliberately exact-match only. A previous implementation also accepted any
   * entry with >= 0.85 Jaccard overlap on stemmed, stop-word-filtered tokens.
   * That tokeniser discards tokens shorter than two characters, so "What is
   * layer 1?" and "What is layer 2?" both collapsed to {layer} and scored 1.00,
   * causing the first answer to be replayed for a different question. Fuzzy
   * matching on a lossy token set cannot be made safe by tuning the threshold,
   * so it is removed.
   */
  async find(
    query: string,
    filters: { documentId?: string; workspaceId?: string }
  ): Promise<CachedResponse | null> {
    if (!(await isCacheTableReady())) return null;

    try {
      const exactMatch = await prisma.semanticCache.findFirst({
        where: {
          queryHash: this.hashQuery(query),
          documentId: filters.documentId ?? null,
          workspaceId: filters.workspaceId ?? null
        }
      });

      if (exactMatch) {
        return { answer: exactMatch.answer, citations: exactMatch.citations };
      }

      return null;
    } catch {
      cacheTableAvailable = false;
      return null;
    }
  },

  async save(
    query: string,
    filters: { documentId?: string; workspaceId?: string },
    answer: string,
    citations: any
  ): Promise<void> {
    if (!(await isCacheTableReady())) return;

    try {
      const queryHash = this.hashQuery(query);
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
    } catch {
      cacheTableAvailable = false;
    }
  }
};
