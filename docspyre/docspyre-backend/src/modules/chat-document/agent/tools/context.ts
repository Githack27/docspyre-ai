import type { ResolvedProvider } from '../../llm/provider-resolver.service';
import type { RetrievedChunk, RetrievalMode } from '../../retrieval/retriever.service';
import type { DatasetSchema } from '../../data/dataset.service';
import type { DatasetSource } from '../../data/duckdb.service';

/** Recorded for every tool invocation and persisted on the agent run. */
export interface ToolCallRecord {
  tool: string;
  args: Record<string, unknown>;
  ok: boolean;
  /** Truncated, human-readable outcome. Never the full payload. */
  summary: string;
  durationMs: number;
}

/**
 * Everything a tool needs for one turn. Built per request so tools never read
 * ambient state and cannot leak across users.
 */
export interface AgentToolContext {
  userId: string;
  sessionId: string;
  provider: ResolvedProvider | null;

  /** Retrieval scope for this turn. */
  documentId: string | null;
  workspaceId: string | null;
  documentName: string | null;
  storageKey: string | null;

  /** Dataset catalogue, empty when the file is not tabular. */
  datasetSchemas: DatasetSchema[];
  datasetSources: DatasetSource[];

  /** Artifacts captured from tool runs, consumed when building the response. */
  artifacts: {
    chunks: RetrievedChunk[];
    retrievalMode: RetrievalMode | null;
    sql: string | null;
    sqlRowCount: number | null;
  };

  /** Append-only audit of tool usage for this turn. */
  toolCalls: ToolCallRecord[];
}

export const createToolContext = (
  input: Omit<AgentToolContext, 'artifacts' | 'toolCalls'>,
): AgentToolContext => ({
  ...input,
  artifacts: { chunks: [], retrievalMode: null, sql: null, sqlRowCount: null },
  toolCalls: [],
});

/** Wraps a tool body so timing and outcome are always recorded. */
export const recordToolCall = async <T>(
  ctx: AgentToolContext,
  tool: string,
  args: Record<string, unknown>,
  run: () => Promise<{ result: T; summary: string }>,
): Promise<T> => {
  const startedAt = Date.now();

  try {
    const { result, summary } = await run();
    ctx.toolCalls.push({
      tool,
      args,
      ok: true,
      summary: summary.slice(0, 500),
      durationMs: Date.now() - startedAt,
    });
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    ctx.toolCalls.push({
      tool,
      args,
      ok: false,
      summary: message.slice(0, 500),
      durationMs: Date.now() - startedAt,
    });
    throw error;
  }
};
