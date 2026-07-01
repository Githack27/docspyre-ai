import type { Request, Response } from 'express';
import { shareService } from './share.service';
import { asyncHandler } from '../../utils/async-handler';

/** HTTP layer for document sharing and the aggregated shared views. */
export const shareController = {
  share: asyncHandler(async (req: Request, res: Response) => {
    const { documentId, userIds, permission } = req.body;
    const recipients = await shareService.share(req.auth!.userId, documentId, userIds, permission);
    res.status(201).json({ recipients });
  }),

  recipients: asyncHandler(async (req: Request, res: Response) => {
    const recipients = await shareService.listRecipients(req.auth!.userId, req.params.documentId!);
    res.status(200).json({ recipients });
  }),

  revoke: asyncHandler(async (req: Request, res: Response) => {
    await shareService.revoke(req.auth!.userId, req.params.documentId!, req.params.userId!);
    res.status(204).send();
  }),

  withMe: asyncHandler(async (req: Request, res: Response) => {
    const items = await shareService.listSharedWithMe(req.auth!.userId);
    res.status(200).json({ items });
  }),

  byMe: asyncHandler(async (req: Request, res: Response) => {
    const items = await shareService.listSharedByMe(req.auth!.userId);
    res.status(200).json({ items });
  }),
};
