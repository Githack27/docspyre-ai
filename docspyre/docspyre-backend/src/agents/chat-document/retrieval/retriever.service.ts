import {
  db, eq, and, inArray, sql,
  documentChunks, workspaceFiles,
} from '@docspyre/database';
import { env } from '../../../core/config';
import { logger } from '../../../core/utils/logger';
import { embeddingService } from './embedding.service';
import type { ResolvedProvider } from '../llm/provider-resolver.service';

export interface RetrievedChunk {
  chunk_id: string;
  document_id: string;
  page: number;
  bbox: number[];
  section_path: string[];
  text: string;
  parent_text: string | null;
  score: number;
}

export type RetrievalMode = 'hybrid' | 'lexical' | 'empty';

export interface RetrievalResult {
  chunks: RetrievedChunk[];
  mode: RetrievalMode;
  candidateCount: number;
}

export interface RetrievalFilters {
  documentId?: string;
  workspaceId?: string;
}

/** Upper bound on rows pulled into memory for scoring. */
const CANDIDATE_LIMIT = 400;
/** Below this many lexical hits we widen to an unfiltered sample. */
const MIN_LEXICAL_HITS = 20;
/** Reciprocal-rank-fusion damping constant. */
const RRF_K = 60;

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have',
  'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may',
  'might', 'shall', 'can', 'of', 'in', 'to', 'for', 'with', 'on', 'at', 'from',
  'by', 'as', 'into', 'through', 'during', 'before', 'after', 'above', 'below',
  'between', 'and', 'but', 'or', 'nor', 'not', 'so', 'yet', 'both', 'either',
  'neither', 'each', 'every', 'all', 'any', 'few', 'more', 'most', 'other',
  'some', 'such', 'no', 'only', 'same', 'than', 'too', 'very', 'just', 'this',
  'that', 'these', 'those', 'it', 'its', 'what', 'which', 'who', 'whom', 'how',
  'when', 'where', 'why', 'about', 'me', 'my', 'you', 'your',
]);

const queryTerms = (query: string): string[] =>
  [...new Set(
    query
      .toLowerCase()
      .split(/\W+/)
      .filter((token) => token.length > 2 && !STOP_WORDS.has(token)),
  )];

const cosineSimilarity = (a: number[], b: number[]): number => {
  if (a.length !== b.length || a.length === 0) return 0;

  let dot = 0;
  let magA = 0;
  let magB = 0;

  for (let i = 0; i < a.length; i += 1) {
    const av = a[i] ?? 0;
    const bv = b[i] ?? 0;
    dot += av * bv;
    magA += av * av;
    magB += bv * bv;
  }

  const denominator = Math.sqrt(magA) * Math.sqrt(magB);
  return denominator === 0 ? 0 : dot / denominator;
};

/** Okapi BM25 term-frequency score against a chunk's extracted keywords. */
const bm25 = (terms: string[], keywords: string[]): number => {
  const k1 = 1.2;
  const b = 0.75;
  const averageLength = 30;
  const length = keywords.length || 1;

  let score = 0;
  for (const term of terms) {
    let frequency = 0;
    for (const keyword of keywords) {
      if (keyword === term) frequency += 1;
    }
    if (!frequency) continue;

    score += (frequency * (k1 + 1)) / (frequency + k1 * (1 - b + b * (length / averageLength)));
  }
  return score;
};

/** Resolves a retrieval scope to the set of document ids it covers. */
const resolveDocumentIds = async (filters: RetrievalFilters): Promise<string[] | null> => {
  if (filters.documentId) return [filters.documentId];

  if (filters.workspaceId) {
    const rows = await db
      .select({ documentId: workspaceFiles.documentId })
      .from(workspaceFiles)
      .where(eq(workspaceFiles.workspaceId, filters.workspaceId));

    const ids = rows
      .map((row) => row.documentId)
      .filter((id): id is string => Boolean(id));

    return ids.length ? [...new Set(ids)] : [];
  }

  return null;
};

type ChunkRow = {
  id: string;
  documentId: string;
  chunkId: string;
  parentChunkId: string | null;
  page: number;
  sectionPath: string[];
  bbox: number[];
  text: string;
  embedding: number[];
  keywords: string[];
  embeddingModel: string | null;
};

const selectChunks = () =>
  db
    .select({
      id: documentChunks.id,
      documentId: documentChunks.documentId,
      chunkId: documentChunks.chunkId,
      parentChunkId: documentChunks.parentChunkId,
      page: documentChunks.page,
      sectionPath: documentChunks.sectionPath,
      bbox: documentChunks.bbox,
      text: documentChunks.text,
      embedding: documentChunks.embedding,
      keywords: documentChunks.keywords,
      embeddingModel: documentChunks.embeddingModel,
    })
    .from(documentChunks);

/**
 * Loads a bounded candidate set. Postgres does the first cut via array overlap
 * on extracted keywords, so a large corpus does not get pulled into Node just
 * to be discarded by the scorer.
 */
const loadCandidates = async (
  documentIds: string[] | null,
  terms: string[],
): Promise<ChunkRow[]> => {
  const scope = documentIds ? inArray(documentChunks.documentId, documentIds) : undefined;

  if (terms.length) {
    const overlap = sql`${documentChunks.keywords} && ${sql.param(terms)}::text[]`;
    const lexical = (await selectChunks()
      .where(scope ? and(scope, overlap) : overlap)
      .limit(CANDIDATE_LIMIT)) as ChunkRow[];

    if (lexical.length >= MIN_LEXICAL_HITS) return lexical;

    // Widen: the question may be phrased with none of the indexed keywords.
    const broad = (await selectChunks()
      .where(scope)
      .limit(CANDIDATE_LIMIT)) as ChunkRow[];

    const merged = new Map<string, ChunkRow>();
    for (const row of [...lexical, ...broad]) merged.set(row.id, row);
    return [...merged.values()];
  }

  return (await selectChunks().where(scope).limit(CANDIDATE_LIMIT)) as ChunkRow[];
};

/** Most common embedding model across candidates, so vectors are comparable. */
const dominantEmbeddingModel = (rows: ChunkRow[]): string | null => {
  const tally = new Map<string, number>();

  for (const row of rows) {
    if (!row.embeddingModel || !row.embedding?.length) continue;
    tally.set(row.embeddingModel, (tally.get(row.embeddingModel) ?? 0) + 1);
  }

  let best: string | null = null;
  let bestCount = 0;
  for (const [model, count] of tally) {
    if (count > bestCount) {
      best = model;
      bestCount = count;
    }
  }
  return best;
};

export const retrieverService = {
  /**
   * Hybrid retrieval: dense cosine similarity fused with BM25 via reciprocal
   * rank fusion, then parent-chunk expansion for wider answer context.
   *
   * Degrades to lexical-only when no embedding model can score the candidates,
   * which is reported back so the caller can surface reduced confidence.
   */
  async retrieve(input: {
    query: string;
    filters: RetrievalFilters;
    topK?: number;
    provider: ResolvedProvider | null;
  }): Promise<RetrievalResult> {
    const topK = input.topK ?? env.AGENT_MAX_CONTEXT_CHUNKS;
    const documentIds = await resolveDocumentIds(input.filters);

    if (documentIds && documentIds.length === 0) {
      return { chunks: [], mode: 'empty', candidateCount: 0 };
    }

    const terms = queryTerms(input.query);
    const candidates = await loadCandidates(documentIds, terms);

    if (!candidates.length) {
      return { chunks: [], mode: 'empty', candidateCount: 0 };
    }

    // Dense scoring requires the query vector to come from the same model that
    // produced the stored vectors.
    const storedModel = dominantEmbeddingModel(candidates);
    let queryVector: number[] | null = null;

    if (storedModel) {
      const model = await embeddingService.byId(storedModel, input.provider);
      if (model) {
        try {
          queryVector = await model.embedOne(input.query);
        } catch (error) {
          logger.debug('Query embedding failed, using lexical retrieval', {
            model: storedModel,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }

    const scored = candidates.map((row) => ({
      row,
      dense: queryVector && row.embeddingModel === storedModel
        ? cosineSimilarity(queryVector, row.embedding ?? [])
        : 0,
      sparse: bm25(terms, row.keywords ?? []),
    }));

    const mode: RetrievalMode = queryVector ? 'hybrid' : 'lexical';

    // Rank independently, then fuse. RRF avoids having to calibrate the two
    // score scales against each other.
    const denseRanks = new Map<string, number>();
    [...scored]
      .sort((a, b) => b.dense - a.dense)
      .forEach((item, index) => denseRanks.set(item.row.id, index + 1));

    const sparseRanks = new Map<string, number>();
    [...scored]
      .sort((a, b) => b.sparse - a.sparse)
      .forEach((item, index) => sparseRanks.set(item.row.id, index + 1));

    const fused = scored
      .map((item) => {
        const denseRank = denseRanks.get(item.row.id) ?? scored.length;
        const sparseRank = sparseRanks.get(item.row.id) ?? scored.length;
        const denseTerm = mode === 'hybrid' ? 1 / (RRF_K + denseRank) : 0;
        return { ...item, fused: denseTerm + 1 / (RRF_K + sparseRank) };
      })
      .sort((a, b) => b.fused - a.fused)
      .slice(0, topK);

    // A child chunk is precise for matching but thin for answering; pull its
    // parent so the model sees surrounding context.
    const parentKeys = fused
      .map((item) => item.row.parentChunkId)
      .filter((id): id is string => Boolean(id));

    const parentText = new Map<string, string>();
    if (parentKeys.length) {
      const parents = await db
        .select({
          documentId: documentChunks.documentId,
          chunkId: documentChunks.chunkId,
          text: documentChunks.text,
        })
        .from(documentChunks)
        .where(
          and(
            inArray(documentChunks.documentId, [...new Set(fused.map((i) => i.row.documentId))]),
            inArray(documentChunks.chunkId, [...new Set(parentKeys)]),
          ),
        );

      for (const parent of parents) {
        parentText.set(`${parent.documentId}:${parent.chunkId}`, parent.text);
      }
    }

    const chunks: RetrievedChunk[] = fused.map((item) => ({
      chunk_id: item.row.chunkId,
      document_id: item.row.documentId,
      page: item.row.page,
      bbox: item.row.bbox ?? [],
      section_path: item.row.sectionPath ?? [],
      text: item.row.text,
      parent_text: item.row.parentChunkId
        ? parentText.get(`${item.row.documentId}:${item.row.parentChunkId}`) ?? null
        : null,
      score: item.fused,
    }));

    return { chunks, mode, candidateCount: candidates.length };
  },
};
