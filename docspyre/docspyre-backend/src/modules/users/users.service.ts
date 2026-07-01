import { prisma } from '../../db/prisma';
import { UserStatus } from '@docspyre/database';

/** Minimal, safe user shape for pickers and member lists. */
export interface UserLite {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
}

const toLite = (u: {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
}): UserLite => ({
  id: u.id,
  email: u.email,
  firstName: u.firstName,
  lastName: u.lastName,
});

export const usersService = {
  /**
   * Finds active, registered users whose email matches the query, excluding
   * the caller (they are already part of any workspace they create).
   */
  async searchByEmail(query: string, excludeUserId: string): Promise<UserLite[]> {
    const users = await prisma.user.findMany({
      where: {
        emailNormalized: { contains: query },
        status: UserStatus.ACTIVE,
        deletedAt: null,
        id: { not: excludeUserId },
      },
      orderBy: { emailNormalized: 'asc' },
      take: 8,
      select: { id: true, email: true, firstName: true, lastName: true },
    });
    return users.map(toLite);
  },
};
