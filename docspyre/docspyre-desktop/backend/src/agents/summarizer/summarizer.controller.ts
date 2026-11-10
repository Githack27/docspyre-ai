import type { Request, Response } from 'express';
import { summarizerService } from './summarizer.service';
import type { SummarizerStreamEvent } from './agent/runtime';
import { asyncHandler } from '../../core/utils/async-handler';
import { ApiError } from '../../core/utils/api-error';
import { logger } from '../../core/utils/logger';

const frame = (payload: unknown): string => `data: ${JSON.stringify(payload)}\n\n`;

export const summarizerController = {
  streamGenerate: asyncHandler(async (req: Request, res: Response) => {
    const { documentId, workspaceId, format, customFocus, includeImages } = req.body ?? {};

    if (!documentId) {
      throw ApiError.badRequest('documentId is required');
    }

    const userId = req.auth!.userId;

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    let clientGone = false;
    req.on('close', () => {
      clientGone = true;
    });

    const emit = (event: SummarizerStreamEvent): void => {
      if (clientGone || res.writableEnded) return;
      res.write(frame(event));
    };

    try {
      await summarizerService.generateManual({
        userId,
        documentId,
        workspaceId,
        format,
        customFocus,
        includeImages: includeImages ?? true,
        emit,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Summarizer failed';
      logger.error('Summarizer stream error', { documentId, error: message });
      if (!clientGone && !res.writableEnded) {
        res.write(frame({ type: 'error', message }));
      }
    } finally {
      if (!res.writableEnded) {
        res.end();
      }
    }
  }),

  listNotes: asyncHandler(async (req: Request, res: Response) => {
    const { documentId } = req.params;
    if (!documentId) throw ApiError.badRequest('documentId is required');

    const notes = await summarizerService.listNotes(req.auth!.userId, documentId);
    res.status(200).json({ notes });
  }),

  getNote: asyncHandler(async (req: Request, res: Response) => {
    const { noteId } = req.params;
    if (!noteId) throw ApiError.badRequest('noteId is required');

    const note = await summarizerService.getNote(req.auth!.userId, noteId);
    res.status(200).json({ note });
  }),

  deleteNote: asyncHandler(async (req: Request, res: Response) => {
    const { noteId } = req.params;
    if (!noteId) throw ApiError.badRequest('noteId is required');

    await summarizerService.deleteNote(req.auth!.userId, noteId);
    res.status(204).send();
  }),

  serveImage: asyncHandler(async (req: Request, res: Response) => {
    const { imageKey } = req.params;
    if (!imageKey) throw ApiError.badRequest('imageKey is required');

    const { stream, contentType } = summarizerService.getImageStream(imageKey);
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    stream.pipe(res);
  }),
};
