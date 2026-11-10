import { z } from 'zod';

export const createSessionSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(150, 'Title is too long'),
  documentId: z.string().uuid('Invalid document id').optional().nullable(),
  workspaceId: z.string().uuid('Invalid workspace id').optional().nullable(),
  workspaceFileId: z.string().uuid('Invalid file id').optional().nullable(),
});

export const addMessageSchema = z.object({
  content: z.string().trim().min(1, 'Message content is required'),
  role: z.enum(['user', 'assistant', 'system']).default('user'),
});

export const listSessionsQuery = z.object({
  documentId: z.string().uuid().optional(),
  workspaceId: z.string().uuid().optional(),
});

export const sessionIdParam = z.object({
  sessionId: z.string().uuid('Invalid session id'),
});

export type CreateSessionInput = z.infer<typeof createSessionSchema>;
export type AddMessageInput = z.infer<typeof addMessageSchema>;
