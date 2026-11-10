import { z } from 'zod';

export const shareDocumentSchema = z.object({
  documentId: z.string().uuid(),
  userIds: z.array(z.string().uuid()).min(1).max(50),
  permission: z.enum(['VIEW', 'DOWNLOAD']).default('VIEW'),
});

export const revokeShareParam = z.object({
  documentId: z.string().uuid(),
  userId: z.string().uuid(),
});

export const documentParam = z.object({
  documentId: z.string().uuid(),
});
