import { db, eq, documents } from '@docspyre/database';
import { logger } from '../../../core/utils/logger';
import { providerResolverService } from '../llm/provider-resolver.service';
import { datasetService } from '../data/dataset.service';
import { parserService } from './parser.service';
import { chunkerService } from './chunker.service';
import { indexerService } from './indexer.service';
import { summarizerService } from './summarizer.service';

export interface IngestionJob {
  documentId: string;
  ownerId: string;
  name: string;
  mimeType: string;
  storageKey: string;
}

/**
 * Single-worker in-process queue. Ingestion is CPU and API bound, so serialising
 * keeps memory and provider rate limits predictable. Jobs are lost on restart;
 * documents can be re-queued through the reingest endpoint.
 */
const queue: IngestionJob[] = [];
let processing = false;

const setStatus = async (
  documentId: string,
  patch: Partial<{
    ingestionStatus: string;
    ingestionError: string | null;
    pageCount: number | null;
  }>,
): Promise<void> => {
  await db.update(documents).set(patch).where(eq(documents.id, documentId));
};

const process = async (job: IngestionJob): Promise<void> => {
  // The owner's provider config drives summarisation and dataset description.
  const provider = await providerResolverService.resolve(job.ownerId);

  await setStatus(job.documentId, { ingestionStatus: 'PARSING', ingestionError: null });

  // Structured data files are registered for SQL access. This is additive: a
  // CSV is still parsed and indexed as text so both branches can answer.
  const datasetTableCount = await datasetService.profileDocument({
    documentId: job.documentId,
    name: job.name,
    mimeType: job.mimeType,
    storageKey: job.storageKey,
    provider,
  });

  const blocks = await parserService.parse(job.storageKey, job.mimeType, job.name);
  const pageCount = blocks.reduce((max, block) => Math.max(max, block.page), 0) || null;

  await setStatus(job.documentId, { ingestionStatus: 'INDEXING', pageCount });

  const chunks = chunkerService.chunk(blocks, job.documentId);
  await indexerService.index(job.documentId, chunks, provider);

  await setStatus(job.documentId, { ingestionStatus: 'SUMMARIZING' });

  await summarizerService.summarizeDocument({
    documentId: job.documentId,
    name: job.name,
    chunks: chunks.map((chunk) => ({
      text: chunk.text,
      page: chunk.page,
      sectionPath: chunk.sectionPath,
      chunkType: chunk.chunkType,
    })),
    provider,
  });

  await setStatus(job.documentId, { ingestionStatus: 'READY', ingestionError: null });

  logger.info('Ingestion complete', {
    document: job.name,
    chunks: chunks.length,
    datasetTables: datasetTableCount,
  });
};

const drain = async (): Promise<void> => {
  if (processing) return;
  processing = true;

  try {
    while (queue.length) {
      const job = queue.shift();
      if (!job) break;

      try {
        await process(job);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error('Ingestion failed', { document: job.name, error: message });

        await setStatus(job.documentId, {
          ingestionStatus: 'FAILED',
          ingestionError: message.slice(0, 2_000),
        }).catch(() => undefined);
      }
    }
  } finally {
    processing = false;
  }
};

export const ingestionQueue = {
  enqueue(job: IngestionJob): void {
    queue.push(job);
    void drain();
  },

  get depth(): number {
    return queue.length;
  },
};
