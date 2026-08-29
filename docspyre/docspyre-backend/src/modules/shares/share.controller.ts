import type { Request, Response } from 'express';
import { shareService } from './share.service';
import { asyncHandler } from '../../core/utils/async-handler';

export const shareController = {
  share: asyncHandler(async (req: Request, res: Response) => {
    const recipients = await shareService.share(req.auth!.userId, req.body.documentId, req.body.userIds, req.body.permission);
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
    const shares = await shareService.listSharedWithMe(req.auth!.userId);
    res.status(200).json({ shares });
  }),

  byMe: asyncHandler(async (req: Request, res: Response) => {
    const shares = await shareService.listSharedByMe(req.auth!.userId);
    res.status(200).json({ shares });
  }),
};
