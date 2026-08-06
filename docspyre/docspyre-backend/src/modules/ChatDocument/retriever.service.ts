import { prisma } from '../../db/prisma';
import { indexerService } from './indexer.service';

export interface RetrievedChunk {
  chunk_id: string;
  document_id: string;
  page: number;
  section_path: string[];
  bbox: number[];
  text: string;
  score: number;
  parent_text?: string;
  parent_chunk_id?: string | null;
}

// Dot product
function dotProduct(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const valA = a[i];
    const valB = b[i];
    if (valA !== undefined && valB !== undefined) {
      sum += valA * valB;
    }
  }
  return sum;
}

// Magnitude
function magnitude(a: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const val = a[i];
    if (val !== undefined) {
      sum += val * val;
    }
  }
  return Math.sqrt(sum);
}

// Cosine similarity
function cosineSimilarity(a: number[], b: number[]): number {
  const magA = magnitude(a);
  const magB = magnitude(b);
  if (magA === 0 || magB === 0) return 0;
  return dotProduct(a, b) / (magA * magB);
}

export const retrieverService = {
  /**
   * Performs hybrid search (dense + sparse) over document chunks, merges with RRF,
   * reranks, and expands to parent chunks.
   */
  async retrieve(
    query: string,
    filters: { documentId?: string; workspaceId?: string },
    topK = 5
  ): Promise<RetrievedChunk[]> {
    console.log(`[RetrieverService] Starting retrieval for query="${query}", filters=${JSON.stringify(filters)}`);

    // 1. Resolve Document IDs within scope
    let documentIds: string[] = [];
    if (filters.documentId) {
      documentIds = [filters.documentId];
    } else if (filters.workspaceId) {
      const wFiles = await prisma.workspaceFile.findMany({
        where: { workspaceId: filters.workspaceId, deletedAt: null, documentId: { not: null } },
        select: { documentId: true }
      });
      documentIds = wFiles.map(f => f.documentId!).filter(Boolean);
    }

    if (documentIds.length === 0) {
      console.log(`[RetrieverService] No documents found in target scope.`);
      return [];
    }

    // Fetch child chunks (where parentChunkId is not null)
    const childChunks = await prisma.documentChunk.findMany({
      where: {
        documentId: { in: documentIds },
        parentChunkId: { not: null }
      }
    });

    if (childChunks.length === 0) {
      console.log(`[RetrieverService] No indexed chunks found in scope.`);
      return [];
    }

    console.log(`[RetrieverService] Scoring ${childChunks.length} child chunks...`);

    // 2. Dense Vector Retrieval
    const queryVector = await indexerService.generateEmbedding(query);
    const denseScores = childChunks.map(chunk => {
      const score = cosineSimilarity(queryVector, chunk.embedding);
      return { chunk, score };
    }).sort((a, b) => b.score - a.score);

    // 3. Sparse Retrieval (BM25)
    const queryTokens = indexerService.tokenizeText(query);
    const sparseScores = this.calculateBM25(childChunks, queryTokens);

    // 4. Reciprocal Rank Fusion (RRF)
    const denseRanks = new Map<string, number>();
    denseScores.forEach((item, idx) => denseRanks.set(item.chunk.id, idx + 1));

    const sparseRanks = new Map<string, number>();
    sparseScores.forEach((item, idx) => sparseRanks.set(item.chunk.id, idx + 1));

    const k = 60; // RRF constant
    const rrfScores = childChunks.map(chunk => {
      const dRank = denseRanks.get(chunk.id) ?? 9999;
      const sRank = sparseRanks.get(chunk.id) ?? 9999;
      const rrfScore = (1 / (k + dRank)) + (1 / (k + sRank));
      return { chunk, score: rrfScore };
    }).sort((a, b) => b.score - a.score);

    // Take top 2x candidates for reranking
    const candidates = rrfScores.slice(0, Math.min(topK * 2, rrfScores.length));

    // 5. Heuristic-Based Cross-Encoder Reranker
    const reranked = candidates.map(cand => {
      const text = cand.chunk.text.toLowerCase();
      const qLower = query.toLowerCase();
      
      // Heuristic score: term proximity and substring overlap
      let termOverlapScore = 0;
      for (const t of queryTokens) {
        if (text.includes(t)) termOverlapScore += 1.0;
      }

      // Exact phrase match bonus
      const phraseMatchBonus = text.includes(qLower) ? 2.5 : 0;

      // Cosine similarity from dense score
      const dRank = denseRanks.get(cand.chunk.id) ?? 9999;
      const dScore = denseScores.find(item => item.chunk.id === cand.chunk.id)?.score ?? 0;

      const finalScore = cand.score * 0.4 + dScore * 0.4 + (termOverlapScore / (queryTokens.length || 1)) * 0.2 + phraseMatchBonus;

      return {
        chunk: cand.chunk,
        score: finalScore
      };
    }).sort((a, b) => b.score - a.score).slice(0, topK);

    // 6. Parent Chunk Expansion
    console.log(`[RetrieverService] Expanding top-${reranked.length} matches to parent chunks...`);
    const results: RetrievedChunk[] = [];
    
    for (const item of reranked) {
      let parentText = item.chunk.text;
      
      if (item.chunk.parentChunkId) {
        // Fetch parent text
        const parent = await prisma.documentChunk.findFirst({
          where: { chunkId: item.chunk.parentChunkId, documentId: item.chunk.documentId }
        });
        if (parent) {
          parentText = parent.text;
        }
      }

      results.push({
        chunk_id: item.chunk.chunkId,
        document_id: item.chunk.documentId,
        page: item.chunk.page,
        section_path: item.chunk.sectionPath,
        bbox: item.chunk.bbox,
        text: item.chunk.text,
        score: item.score,
        parent_text: parentText,
        parent_chunk_id: item.chunk.parentChunkId
      });
    }

    return results;
  },

  /**
   * Simple BM25 scoring.
   */
  calculateBM25(chunks: any[], queryTokens: string[]): { chunk: any; score: number }[] {
    const N = chunks.length;
    const k1 = 1.2;
    const b = 0.75;

    // Calculate document lengths
    const docLengths = chunks.map(c => c.keywords.length);
    const avgdl = docLengths.reduce((sum, len) => sum + len, 0) / (N || 1);

    // Calculate Document Frequency (DF) for each query token
    const df = new Map<string, number>();
    for (const token of queryTokens) {
      let count = 0;
      for (const c of chunks) {
        if (c.keywords.includes(token)) count++;
      }
      df.set(token, count);
    }

    // Score each chunk
    const scores = chunks.map(chunk => {
      let score = 0;
      const docLen = chunk.keywords.length;

      for (const token of queryTokens) {
        const n_q = df.get(token) ?? 0;
        // IDF formula
        const idf = Math.log(((N - n_q + 0.5) / (n_q + 0.5)) + 1);

        // Term Frequency (TF) of token in chunk keywords list
        // For simple chunks, we can estimate TF based on word occurrences in text
        const tf = chunk.text.toLowerCase().split(token).length - 1;

        if (tf > 0) {
          const numerator = tf * (k1 + 1);
          const denominator = tf + k1 * (1 - b + b * (docLen / (avgdl || 1)));
          score += idf * (numerator / denominator);
        }
      }

      return { chunk, score };
    });

    return scores.sort((a, b) => b.score - a.score);
  }
};
