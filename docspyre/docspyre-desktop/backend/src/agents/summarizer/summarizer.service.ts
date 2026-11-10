import path from 'node:path';
import { existsSync, createReadStream } from 'node:fs';
import { db, eq, and, desc, documentNotes, documents } from '@docspyre/database';
import { providerResolverService } from '../chat-document/llm/provider-resolver.service';
import { buildSummarizerGraph } from './agent/graph';
import type { SummarizerStreamEvent } from './agent/runtime';
import type { SummarizerFormat } from './prompts/summarizer.prompt';
import { env } from '../../core/config';
import { ApiError } from '../../core/utils/api-error';
import { logger } from '../../core/utils/logger';

const UPLOAD_ROOT = path.isAbsolute(env.UPLOAD_DIR)
  ? env.UPLOAD_DIR
  : path.resolve(process.cwd(), env.UPLOAD_DIR);

const IMAGES_DIR = path.join(UPLOAD_ROOT, 'notes-images');

export interface GenerateManualInput {
  userId: string;
  documentId: string;
  workspaceId?: string | null;
  format?: SummarizerFormat;
  customFocus?: string;
  includeImages?: boolean;
  emit: (event: SummarizerStreamEvent) => void;
}

export const summarizerService = {
  async generateManual(input: GenerateManualInput) {
    const { userId, documentId, workspaceId, format, customFocus, includeImages, emit } = input;

    // Verify document existence & ownership/access
    const [doc] = await db
      .select()
      .from(documents)
      .where(eq(documents.id, documentId))
      .limit(1);

    if (!doc) {
      throw ApiError.notFound('Document not found');
    }

    const provider = await providerResolverService.resolve(userId, workspaceId);

    const runtime = {
      provider,
      emit,
    };

    const graph = buildSummarizerGraph(runtime);

    try {
      const finalState = await graph.invoke({
        documentId,
        userId,
        workspaceId: workspaceId || null,
        format: format || 'manual',
        customFocus: customFocus || '',
        includeImages: includeImages ?? true,
      });

      return finalState;
    } catch (err) {
      logger.error('Summarizer graph execution failed', {
        documentId,
        error: err instanceof Error ? err.message : String(err),
      });
      emit({
        type: 'error',
        message: err instanceof Error ? err.message : 'Summarizer agent execution encountered an error.',
      });
      throw err;
    }
  },

  async listNotes(userId: string, documentId: string) {
    return db
      .select({
        id: documentNotes.id,
        documentId: documentNotes.documentId,
        title: documentNotes.title,
        subtitle: documentNotes.subtitle,
        format: documentNotes.format,
        images: documentNotes.images,
        createdAt: documentNotes.createdAt,
        updatedAt: documentNotes.updatedAt,
      })
      .from(documentNotes)
      .where(and(eq(documentNotes.documentId, documentId), eq(documentNotes.userId, userId)))
      .orderBy(desc(documentNotes.createdAt));
  },

  async getNote(userId: string, noteId: string) {
    const [note] = await db
      .select()
      .from(documentNotes)
      .where(and(eq(documentNotes.id, noteId), eq(documentNotes.userId, userId)))
      .limit(1);

    if (!note) {
      throw ApiError.notFound('Notes document not found');
    }

    return note;
  },

  async deleteNote(userId: string, noteId: string) {
    const [deleted] = await db
      .delete(documentNotes)
      .where(and(eq(documentNotes.id, noteId), eq(documentNotes.userId, userId)))
      .returning({ id: documentNotes.id });

    if (!deleted) {
      throw ApiError.notFound('Notes document not found or already deleted');
    }

    return deleted;
  },

  getImageStream(imageKey: string) {
    const safeKey = path.basename(imageKey);
    const filePath = path.join(IMAGES_DIR, safeKey);

    if (!existsSync(filePath)) {
      throw ApiError.notFound('Image not found');
    }

    const ext = path.extname(safeKey).toLowerCase();
    let contentType = 'image/jpeg';
    if (ext === '.png') contentType = 'image/png';
    else if (ext === '.svg') contentType = 'image/svg+xml';
    else if (ext === '.webp') contentType = 'image/webp';

    return {
      stream: createReadStream(filePath),
      contentType,
    };
  },
};
