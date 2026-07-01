import type { Request, Response } from 'express';
import { workspaceService } from './workspace.service';
import { asyncHandler } from '../../utils/async-handler';
import { ApiError } from '../../utils/api-error';

/** Thin HTTP layer over the workspace service. */
export const workspaceController = {
  list: asyncHandler(async (req: Request, res: Response) => {
    const workspaces = await workspaceService.listForUser(req.auth!.userId);
    res.status(200).json({ workspaces });
  }),

  create: asyncHandler(async (req: Request, res: Response) => {
    const workspace = await workspaceService.create(req.auth!.userId, req.body);
    res.status(201).json({ workspace });
  }),

  get: asyncHandler(async (req: Request, res: Response) => {
    const workspace = await workspaceService.getDetail(req.params.workspaceId!, req.auth!.userId);
    res.status(200).json({ workspace });
  }),

  listFiles: asyncHandler(async (req: Request, res: Response) => {
    const files = await workspaceService.listFiles(req.params.workspaceId!);
    res.status(200).json({ files });
  }),

  addFile: asyncHandler(async (req: Request, res: Response) => {
    const file = await workspaceService.addFile(
      req.params.workspaceId!,
      req.auth!.userId,
      req.body,
    );
    res.status(201).json({ file });
  }),

  uploadFiles: asyncHandler(async (req: Request, res: Response) => {
    const uploaded = (req.files as Express.Multer.File[] | undefined) ?? [];
    if (!uploaded.length) throw ApiError.badRequest('No files were uploaded');

    const files = [];
    for (const f of uploaded) {
      files.push(
        await workspaceService.uploadFile(req.params.workspaceId!, req.auth!.userId, {
          originalName: f.originalname,
          mimeType: f.mimetype,
          buffer: f.buffer,
        }),
      );
    }
    res.status(201).json({ files });
  }),

  attachDocument: asyncHandler(async (req: Request, res: Response) => {
    const file = await workspaceService.linkDocument(
      req.params.workspaceId!,
      req.auth!.userId,
      req.body.documentId,
    );
    res.status(201).json({ file });
  }),

  deleteFile: asyncHandler(async (req: Request, res: Response) => {
    await workspaceService.deleteFile(req.params.workspaceId!, req.params.fileId!);
    res.status(204).send();
  }),
};
