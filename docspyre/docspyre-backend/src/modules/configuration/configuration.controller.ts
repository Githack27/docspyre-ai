import type { Request, Response } from 'express';
import { configurationService } from './configuration.service';
import { asyncHandler } from '../../core/utils/async-handler';
import { ApiError } from '../../core/utils/api-error';

export const configurationController = {
  list: asyncHandler(async (req: Request, res: Response) => {
    const configs = await configurationService.listConfigs(req.auth!.userId);
    res.status(200).json(configs);
  }),

  create: asyncHandler(async (req: Request, res: Response) => {
    const config = await configurationService.createConfig(req.auth!.userId, req.body);
    res.status(201).json(config);
  }),

  update: asyncHandler(async (req: Request, res: Response) => {
    const config = await configurationService.updateConfig(req.auth!.userId, req.params.id!, req.body);
    res.status(200).json(config);
  }),

  remove: asyncHandler(async (req: Request, res: Response) => {
    await configurationService.deleteConfig(req.auth!.userId, req.params.id!);
    res.status(204).send();
  }),

  validateKey: asyncHandler(async (req: Request, res: Response) => {
    const { providerId, apiKey } = req.body as { providerId?: string; apiKey?: string };
    if (!providerId || !apiKey) {
      throw ApiError.badRequest('providerId and apiKey are required');
    }
    const result = await configurationService.validateKey(providerId, apiKey);
    // Always return 200 — let the frontend check result.valid
    res.status(200).json(result);
  }),
};
