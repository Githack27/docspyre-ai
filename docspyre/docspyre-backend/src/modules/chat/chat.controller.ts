import type { Request, Response } from 'express';
import { chatService } from './chat.service';
import { asyncHandler } from '../../utils/async-handler';

export const chatController = {
  create: asyncHandler(async (req: Request, res: Response) => {
    const session = await chatService.createSession(req.auth!.userId, req.body);
    res.status(201).json({ session });
  }),

  list: asyncHandler(async (req: Request, res: Response) => {
    const documentId = req.query.documentId as string | undefined;
    const workspaceId = req.query.workspaceId as string | undefined;
    const sessions = await chatService.listSessions(req.auth!.userId, { documentId, workspaceId });
    res.status(200).json({ sessions });
  }),

  get: asyncHandler(async (req: Request, res: Response) => {
    const session = await chatService.getSessionDetail(req.auth!.userId, req.params.sessionId!);
    res.status(200).json({ session });
  }),

  rename: asyncHandler(async (req: Request, res: Response) => {
    const session = await chatService.renameSession(req.auth!.userId, req.params.sessionId!, req.body.title);
    res.status(200).json({ session });
  }),

  delete: asyncHandler(async (req: Request, res: Response) => {
    await chatService.deleteSession(req.auth!.userId, req.params.sessionId!);
    res.status(204).send();
  }),

  addMessage: asyncHandler(async (req: Request, res: Response) => {
    const message = await chatService.addMessage(req.auth!.userId, req.params.sessionId!, req.body);
    res.status(201).json({ message });
  }),
};
