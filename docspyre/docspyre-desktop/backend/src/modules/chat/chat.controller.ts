import type { Request, Response } from 'express';
import { chatService } from './chat.service';
import { chatDocumentService } from '../../agents/chat-document/chat-document.service';
import { asyncHandler } from '../../core/utils/async-handler';
import { ApiError } from '../../core/utils/api-error';

export const chatController = {
  list: asyncHandler(async (req: Request, res: Response) => {
    const { workspaceId, documentId } = req.query as Record<string, string | undefined>;
    const sessions = await chatService.listSessions(req.auth!.userId, { workspaceId, documentId });
    res.status(200).json({ sessions });
  }),

  create: asyncHandler(async (req: Request, res: Response) => {
    const session = await chatService.createSession(req.auth!.userId, req.body);
    res.status(201).json({ session });
  }),

  get: asyncHandler(async (req: Request, res: Response) => {
    const session = await chatService.getSessionDetail(req.auth!.userId, req.params.sessionId!);
    res.status(200).json({ session });
  }),

  rename: asyncHandler(async (req: Request, res: Response) => {
    const { title } = req.body;
    if (!title || typeof title !== 'string') throw ApiError.badRequest('Title is required');
    await chatService.renameSession(req.auth!.userId, req.params.sessionId!, title);
    res.status(204).send();
  }),

  remove: asyncHandler(async (req: Request, res: Response) => {
    await chatService.deleteSession(req.auth!.userId, req.params.sessionId!);
    res.status(204).send();
  }),

  addMessage: asyncHandler(async (req: Request, res: Response) => {
    const { content } = req.body;
    if (!content || typeof content !== 'string') throw ApiError.badRequest('Message content is required');
    const result = await chatDocumentService.runTurn({
      userId: req.auth!.userId,
      sessionId: req.params.sessionId!,
      content,
      emit: () => {},
    });
    res.status(201).json({
      answer: result.answer,
      citations: result.citations,
      totalTokens: result.totalTokens,
      newTitle: result.newTitle,
      sessionTitle: result.sessionTitle,
    });
  }),
};
