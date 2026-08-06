import { readFile } from 'node:fs/promises';
import { prisma } from '../../db/prisma';
import { storagePath } from '../documents/document.storage';
import { parserService } from './parser.service';
import { chunkerService } from './chunker.service';
import { indexerService } from './indexer.service';

interface IngestionJob {
  documentId: string;
  name: string;
  mimeType: string;
  storageKey: string;
}

class IngestionQueue {
  private queue: IngestionJob[] = [];
  private processing = false;

  /**
   * Enqueues a document for background ingestion.
   */
  enqueue(job: IngestionJob): void {
    console.log(`[IngestionQueue] Enqueuing documentId=${job.documentId}, name=${job.name}`);
    this.queue.push(job);
    this.triggerProcessor();
  }

  private triggerProcessor(): void {
    if (this.processing) return;
    this.processing = true;
    this.processNext().catch(err => {
      console.error('[IngestionQueue] Processor crashed:', err);
      this.processing = false;
    });
  }

  private async processNext(): Promise<void> {
    if (this.queue.length === 0) {
      this.processing = false;
      return;
    }

    const job = this.queue.shift()!;
    console.log(`[IngestionQueue] Starting job documentId=${job.documentId}`);

    try {
      // 1. Set status to PARSING
      await prisma.document.update({
        where: { id: job.documentId },
        data: { ingestionStatus: 'PARSING', ingestionError: null }
      });

      // Read file buffer from disk storage
      const filePath = storagePath(job.storageKey);
      const buffer = await readFile(filePath);

      // 2. Parse document into Unified IR
      const ir = await parserService.parseDocument(job.documentId, job.name, job.mimeType, buffer);

      // Save page count
      await prisma.document.update({
        where: { id: job.documentId },
        data: { pageCount: ir.page_count }
      });

      // 3. Set status to INDEXING
      await prisma.document.update({
        where: { id: job.documentId },
        data: { ingestionStatus: 'INDEXING' }
      });

      // 4. Chunk document
      const chunks = chunkerService.chunkDocument(job.documentId, ir.blocks);

      // 5. Index chunks (embeddings + BM25 keywords)
      await indexerService.indexChunks(job.documentId, chunks);

      // 6. Set status to READY
      await prisma.document.update({
        where: { id: job.documentId },
        data: { ingestionStatus: 'READY' }
      });

      console.log(`[IngestionQueue] Job completed successfully for documentId=${job.documentId}`);
    } catch (error: any) {
      console.error(`[IngestionQueue] Job failed for documentId=${job.documentId}:`, error);
      
      // Update status to FAILED and record error message
      await prisma.document.update({
        where: { id: job.documentId },
        data: {
          ingestionStatus: 'FAILED',
          ingestionError: error.message || 'Unknown parsing or indexing error'
        }
      });
    }

    // Continue processing next job
    setTimeout(() => {
      this.processNext().catch(err => {
        console.error('[IngestionQueue] Background processor chain error:', err);
        this.processing = false;
      });
    }, 100);
  }
}

export const ingestionQueue = new IngestionQueue();
