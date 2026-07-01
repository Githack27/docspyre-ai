import { z } from 'zod';

export const shareDocumentSchema = z.object({
  documentId: z.string().uuid('Invalid document id'),
  userIds: z.array(z.string().uuid('Invalid user id')).min(1, 'Pick at least one person').max(50, 'Too many recipients'),
  permission: z.enum(['VIEW', 'DOWNLOAD']).default('VIEW'),
});

export const shareDocumentParam = z.object({
  documentId: z.string().uuid('Invalid document id'),
});

export const revokeShareParam = z.object({
  documentId: z.string().uuid('Invalid document id'),
  userId: z.string().uuid('Invalid user id'),
});

export type ShareDocumentInput = z.infer<typeof shareDocumentSchema>;
