import type { Request, Response } from 'express';
import { DocumentKind } from '@docspyre/database';
import { documentService } from './document.service';
import { storageExists, streamFile } from './document.storage';
import { asyncHandler } from '../../utils/async-handler';
import { ApiError } from '../../utils/api-error';

/** Resolves an optional ?kind= query into a valid DocumentKind. */
const parseKind = (raw: unknown): DocumentKind | undefined => {
  if (typeof raw !== 'string') return undefined;
  const upper = raw.toUpperCase();
  return (Object.values(DocumentKind) as string[]).includes(upper)
    ? (upper as DocumentKind)
    : undefined;
};

/** Thin HTTP layer over the document service. */
export const documentController = {
  list: asyncHandler(async (req: Request, res: Response) => {
    const documents = await documentService.list(req.auth!.userId, parseKind(req.query.kind));
    res.status(200).json({ documents });
  }),

  upload: asyncHandler(async (req: Request, res: Response) => {
    const files = (req.files as Express.Multer.File[] | undefined) ?? [];
    if (!files.length) throw ApiError.badRequest('No files were uploaded');

    const documents = [];
    for (const file of files) {
      documents.push(
        await documentService.create(req.auth!.userId, {
          originalName: file.originalname,
          mimeType: file.mimetype,
          buffer: file.buffer,
        }),
      );
    }
    res.status(201).json({ documents });
  }),

  raw: asyncHandler(async (req: Request, res: Response) => {
    const doc = await documentService.getAccessible(req.auth!.userId, req.params.documentId!);
    if (!storageExists(doc.storageKey)) throw ApiError.notFound('File data is missing');

    res.setHeader('Content-Type', doc.mimeType);
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(doc.name)}"`);
    res.setHeader('Cache-Control', 'private, max-age=3600');
    streamFile(doc.storageKey).pipe(res);
  }),

  trash: asyncHandler(async (req: Request, res: Response) => {
    const documents = await documentService.listTrash(req.auth!.userId);
    res.status(200).json({ documents });
  }),

  remove: asyncHandler(async (req: Request, res: Response) => {
    await documentService.softDelete(req.auth!.userId, req.params.documentId!);
    res.status(204).send();
  }),

  restore: asyncHandler(async (req: Request, res: Response) => {
    const document = await documentService.restore(req.auth!.userId, req.params.documentId!);
    res.status(200).json({ document });
  }),

  purge: asyncHandler(async (req: Request, res: Response) => {
    await documentService.permanentDelete(req.auth!.userId, req.params.documentId!);
    res.status(204).send();
  }),

  reingest: asyncHandler(async (req: Request, res: Response) => {
    const document = await documentService.reingest(req.auth!.userId, req.params.documentId!);
    res.status(200).json({ document });
  }),
};
