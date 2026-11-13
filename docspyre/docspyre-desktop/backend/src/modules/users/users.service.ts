import { db, eq, ne, and, or, ilike, users } from '../../db/index.js';

export const userService = {
  async searchByEmail(query: string, callerId: string) {
    const q = `%${query.toLowerCase()}%`;
    const rows = await db
      .select({
        id: users.id,
        email: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
      })
      .from(users)
      .where(
        and(
          or(ilike(users.email, q), ilike(users.name, q)),
          eq(users.status, 'active'),
          ne(users.id, callerId),
        ),
      )
      .limit(8);
    return rows;
  },
};
