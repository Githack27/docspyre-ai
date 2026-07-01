import { z } from 'zod';

/** Query for the member-search autocomplete. */
export const userSearchSchema = z.object({
  email: z.string().trim().toLowerCase().min(1, 'Search term is required').max(120),
});

export type UserSearchQuery = z.infer<typeof userSearchSchema>;
