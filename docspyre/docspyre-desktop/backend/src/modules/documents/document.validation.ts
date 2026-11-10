import { z } from 'zod';

export const documentIdParam = z.object({
  documentId: z.string().uuid(),
});
