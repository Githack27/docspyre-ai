export { prisma, connectDatabase, disconnectDatabase } from './client';

// Re-export Prisma's generated types & enums so consumers depend only on the
// data-layer package and never reach into `@prisma/client` directly.
export * from '@prisma/client';
