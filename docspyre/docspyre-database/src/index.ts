// Database client
export { db, connectDatabase, disconnectDatabase } from './client';
export type { Database } from './client';

// Schema (tables, enums, relations)
export * from './schema';

// Re-export Drizzle utilities consumers commonly need
export { eq, ne, and, or, not, gt, gte, lt, lte, isNull, isNotNull, inArray, notInArray, like, ilike, sql, desc, asc, count } from 'drizzle-orm';
export type { InferSelectModel, InferInsertModel } from 'drizzle-orm';
