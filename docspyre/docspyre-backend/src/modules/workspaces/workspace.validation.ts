import { z } from 'zod';

const email = z.string().trim().toLowerCase().email('A valid email is required');

export const createWorkspaceSchema = z.object({
  name: z.string().trim().min(1, 'Project name is required').max(120, 'Name is too long'),
  // Emails of registered users to invite as members. Unknown emails are
  // ignored server-side; the caller is always added as OWNER.
  memberEmails: z.array(email).max(50, 'Too many members').optional().default([]),
});

export const addFileSchema = z.object({
  name: z.string().trim().min(1, 'File name is required').max(255, 'Name is too long'),
  kind: z.string().trim().max(120).optional(),
  sizeBytes: z.number().int().nonnegative().max(5_000_000_000).optional(),
});

export const workspaceIdParam = z.object({
  workspaceId: z.string().uuid('Invalid workspace id'),
});

export const attachDocumentSchema = z.object({
  documentId: z.string().uuid('Invalid document id'),
});

export const fileParam = z.object({
  workspaceId: z.string().uuid('Invalid workspace id'),
  fileId: z.string().uuid('Invalid file id'),
});

export type CreateWorkspaceInput = z.infer<typeof createWorkspaceSchema>;
export type AddFileInput = z.infer<typeof addFileSchema>;
