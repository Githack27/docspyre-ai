import { createHash } from 'node:crypto';
import { db, eq, and, desc, agentRuns } from '@docspyre/database';
import { logger } from '../../../core/utils/logger';
import type { AgentRoute } from '../agent/prompts';
import type { Citation, ClaimVerification, AnswerSource } from '../agent/state';
import type { ToolCallRecord } from '../agent/tools';

export interface AgentRunScope {
  documentId: string | null;
  workspaceId: string | null;
}

export interface CachedAnswer {
  answer: string;
  citations: Citation[];
  verification: ClaimVerification | null;
  sql: string | null;
}

export interface RecordRunInput {
  sessionId: string;
  userId: string;
  scope: AgentRunScope;
  queryHash: string;
  query: string;
  route: AgentRoute;
  answer: string;
  citations: Citation[];
  toolCalls: ToolCallRecord[];
  verification: ClaimVerification | null;
  retrievedChunkIds: string[];
  sql: string | null;
  sqlRowCount: number | null;
  provider: string | null;
  model: string | null;
  promptTokens: number | null;
  completionTokens: number | null;
  latencyMs: number;
  status: 'SUCCESS' | 'PARTIAL' | 'FAILED';
  error: string | null;
  servedFromCache: boolean;
  answerSource: AnswerSource;
}

/** Answer sources that represent a genuine grounded result worth replaying. */
const CACHEABLE_SOURCES: ReadonlySet<AnswerSource> = new Set<AnswerSource>([
  'model',
  'dataset',
  'summary',
]);

/**
 * Cache key: the normalised question plus the retrieval scope. Scope is part of
 * the key so the same wording against a different file never collides.
 */
export const hashQuery = (question: string, scope: AgentRunScope): string =>
  createHash('sha256')
    .update(
      JSON.stringify({
        q: question.toLowerCase().replace(/\s+/g, ' ').trim(),
        d: scope.documentId ?? '',
        w: scope.workspaceId ?? '',
      }),
    )
    .digest('hex');

export const agentRunRepository = {
  hashQuery,

  /**
   * Most recent replayable answer for a question. Only successful, grounded runs
   * are eligible, so a transient failure or a degraded fallback is never
   * replayed for every future identical question.
   */
  async findCached(queryHash: string, scope: AgentRunScope): Promise<CachedAnswer | null> {
    try {
      const conditions = [
        eq(agentRuns.queryHash, queryHash),
        eq(agentRuns.cacheable, true),
        eq(agentRuns.status, 'SUCCESS'),
      ];

      if (scope.documentId) conditions.push(eq(agentRuns.documentId, scope.documentId));
      if (scope.workspaceId) conditions.push(eq(agentRuns.workspaceId, scope.workspaceId));

      const [row] = await db
        .select({
          answer: agentRuns.answer,
          citations: agentRuns.citations,
          verification: agentRuns.verification,
          sql: agentRuns.sqlQuery,
        })
        .from(agentRuns)
        .where(and(...conditions))
        .orderBy(desc(agentRuns.createdAt))
        .limit(1);

      if (!row?.answer) return null;

      return {
        answer: row.answer,
        citations: (row.citations as Citation[]) ?? [],
        verification: (row.verification as ClaimVerification | null) ?? null,
        sql: row.sql ?? null,
      };
    } catch (error) {
      // A cache miss is always safe; never fail a turn over lookup problems.
      logger.debug('Agent run cache lookup failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  },

  /** Persists a completed run. Returns the row id, or null if the write failed. */
  async record(input: RecordRunInput): Promise<string | null> {
    try {
      const cacheable =
        input.status === 'SUCCESS' &&
        !input.servedFromCache &&
        CACHEABLE_SOURCES.has(input.answerSource) &&
        input.answer.trim().length > 0 &&
        // Grounded branches must actually have had grounding.
        (input.route !== 'document_qa' || input.retrievedChunkIds.length > 0);

      const [row] = await db
        .insert(agentRuns)
        .values({
          sessionId: input.sessionId,
          userId: input.userId,
          documentId: input.scope.documentId,
          workspaceId: input.scope.workspaceId,
          queryHash: input.queryHash,
          query: input.query,
          route: input.route,
          answer: input.answer,
          citations: input.citations,
          toolCalls: input.toolCalls,
          verification: input.verification,
          retrievedChunkIds: input.retrievedChunkIds,
          sqlQuery: input.sql,
          sqlRowCount: input.sqlRowCount,
          provider: input.provider,
          model: input.model,
          promptTokens: input.promptTokens,
          completionTokens: input.completionTokens,
          latencyMs: input.latencyMs,
          status: input.status,
          error: input.error,
          servedFromCache: input.servedFromCache,
          cacheable,
        })
        .returning({ id: agentRuns.id });

      return row?.id ?? null;
    } catch (error) {
      logger.error('Failed to persist agent run', {
        sessionId: input.sessionId,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  },

  /** Links a persisted run to the assistant message it produced. */
  async linkMessage(runId: string, messageId: string): Promise<void> {
    try {
      await db.update(agentRuns).set({ messageId }).where(eq(agentRuns.id, runId));
    } catch (error) {
      logger.debug('Failed to link agent run to message', {
        runId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  },
};
