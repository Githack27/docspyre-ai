import { Annotation } from '@langchain/langgraph';
import type { RetrievedChunk } from '../retrieval/retriever.service';
import type { AgentRoute } from './prompts';

/** Citation payload sent to the client. Field names are part of the API contract. */
export interface Citation {
  index: number;
  chunk_id: string;
  document_id: string;
  page: number;
  bbox: number[];
  section_path: string[];
}

export type ClaimVerdict = 'supported' | 'unsupported' | 'contradicted';

export interface VerifiedClaim {
  text: string;
  verdict: ClaimVerdict;
  /** Retained for backward compatibility with the existing client. */
  supported: boolean;
  sources: number[];
}

export type VerificationStatus = 'verified' | 'partially_verified' | 'unverified' | 'skipped';

export interface ClaimVerification {
  status: VerificationStatus;
  claims: VerifiedClaim[];
}

/** Where the answer text came from; drives cache eligibility. */
export type AnswerSource = 'model' | 'dataset' | 'summary' | 'smalltalk' | 'degraded';

export interface TokenUsage {
  promptTokens: number | null;
  completionTokens: number | null;
}

/**
 * Shared state for one turn. Nodes read what they need and return partial
 * updates; last write wins for every field.
 */
export const AgentState = Annotation.Root({
  /** The user's message for this turn. */
  question: Annotation<string>({
    reducer: (_prev, next) => next,
    default: () => '',
  }),

  route: Annotation<AgentRoute>({
    reducer: (_prev, next) => next,
    default: () => 'document_qa',
  }),

  /** Grounding excerpts gathered by retrieval. */
  chunks: Annotation<RetrievedChunk[]>({
    reducer: (_prev, next) => next,
    default: () => [],
  }),

  /** Rendered excerpt block produced by the search tool. */
  contextText: Annotation<string>({
    reducer: (_prev, next) => next,
    default: () => '',
  }),

  // ── Dataset branch ────────────────────────────────────────────────────────
  sql: Annotation<string | null>({
    reducer: (_prev, next) => next,
    default: () => null,
  }),

  sqlResultText: Annotation<string | null>({
    reducer: (_prev, next) => next,
    default: () => null,
  }),

  sqlError: Annotation<string | null>({
    reducer: (_prev, next) => next,
    default: () => null,
  }),

  sqlAttempts: Annotation<number>({
    reducer: (_prev, next) => next,
    default: () => 0,
  }),

  // ── Output ────────────────────────────────────────────────────────────────
  answer: Annotation<string>({
    reducer: (_prev, next) => next,
    default: () => '',
  }),

  citations: Annotation<Citation[]>({
    reducer: (_prev, next) => next,
    default: () => [],
  }),

  verification: Annotation<ClaimVerification | null>({
    reducer: (_prev, next) => next,
    default: () => null,
  }),

  answerSource: Annotation<AnswerSource>({
    reducer: (_prev, next) => next,
    default: () => 'model',
  }),

  usage: Annotation<TokenUsage>({
    reducer: (_prev, next) => next,
    default: () => ({ promptTokens: null, completionTokens: null }),
  }),

  /** Set when a branch failed in a way the user should be told about. */
  error: Annotation<string | null>({
    reducer: (_prev, next) => next,
    default: () => null,
  }),
});

export type AgentStateType = typeof AgentState.State;
export type AgentStateUpdate = Partial<AgentStateType>;

/** Builds client citation objects from the chunks actually used as context. */
export const citationsFrom = (chunks: RetrievedChunk[]): Citation[] =>
  chunks.map((chunk, index) => ({
    index: index + 1,
    chunk_id: chunk.chunk_id,
    document_id: chunk.document_id,
    page: chunk.page,
    bbox: chunk.bbox ?? [],
    section_path: chunk.section_path ?? [],
  }));
