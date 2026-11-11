import { randomUUID } from 'node:crypto';
import { db, eq, and, documents, documentChunks, documentSummaries, summarizerMemory } from '@docspyre/database';
import type { SummarizerStateType } from '../state';
import type { SummarizerRuntime } from '../runtime';
import { logger } from '../../../../core/utils/logger';

export const initMemoryNode = (runtime: SummarizerRuntime) => {
  return async (state: SummarizerStateType): Promise<Partial<SummarizerStateType>> => {
    runtime.emit({
      type: 'status',
      phase: 'init',
      message: 'Accessing document repository and initializing persistent memory...',
    });

    const [doc] = await db
      .select()
      .from(documents)
      .where(eq(documents.id, state.documentId))
      .limit(1);

    if (!doc) {
      throw new Error(`Document not found: ${state.documentId}`);
    }

    // Retrieve chunk IDs from DB (referential memory only, avoids loading all chunks into memory)
    const chunks = await db
      .select({ id: documentChunks.id, chunkId: documentChunks.chunkId })
      .from(documentChunks)
      .where(eq(documentChunks.documentId, state.documentId));

    const chunkRefIds = chunks.map((c) => c.id);

    // Retrieve precomputed summary if available
    const [existingSummary] = await db
      .select()
      .from(documentSummaries)
      .where(and(eq(documentSummaries.documentId, state.documentId), eq(documentSummaries.scope, 'DOCUMENT')))
      .limit(1);

    // Create unique memory reference in DB
    const contextRef = `mem_${state.documentId.slice(0, 8)}_${Date.now()}`;
    const memoryRecordId = randomUUID();

    await db.insert(summarizerMemory).values({
      id: memoryRecordId,
      documentId: state.documentId,
      userId: state.userId,
      contextRef,
      outline: [],
      extractedFacts: {
        documentName: doc.name,
        totalChunks: chunkRefIds.length,
        hasPrecomputedSummary: Boolean(existingSummary),
      },
      retrievedChunkIds: chunkRefIds,
      memorySnapshot: {
        format: state.format,
        customFocus: state.customFocus,
        includeImages: state.includeImages,
      },
      userItems: {
        customFocus: state.customFocus,
      },
    });

    logger.info('Summarizer agent initialized memory in DB', {
      documentId: state.documentId,
      contextRef,
      chunkCount: chunkRefIds.length,
    });

    runtime.emit({
      type: 'status',
      phase: 'init',
      message: `Document indexed with ${chunkRefIds.length} reference chunks. Memory linked.`,
    });

    return {
      memoryRefId: memoryRecordId,
      chunkRefIds,
      status: 'planning',
    };
  };
};
