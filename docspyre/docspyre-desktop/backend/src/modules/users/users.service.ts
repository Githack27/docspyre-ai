import { db, eq, ne, and, isNull, ilike, users } from '@docspyre/database';

export const userService = {
  async searchByEmail(query: string, callerId: string) {
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
          ilike(users.emailNormalized, `%${query.toLowerCase()}%`),
          eq(users.status, 'ACTIVE'),
          isNull(users.deletedAt),
          ne(users.id, callerId),
        ),
      )
      .limit(8);
    return rows;
  },
};
