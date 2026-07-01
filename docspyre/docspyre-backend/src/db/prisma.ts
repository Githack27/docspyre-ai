/**
 * The backend never talks to Prisma directly; it consumes the shared data
 * layer (`@docspyre/database`). This single re-export keeps that boundary
 * explicit and makes the dependency trivial to mock in tests.
 */
export {
  prisma,
  connectDatabase,
  disconnectDatabase,
} from '@docspyre/database';
