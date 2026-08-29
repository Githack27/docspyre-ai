import { pgTable, uuid, varchar, text, boolean, timestamp, index } from 'drizzle-orm/pg-core';
import { randomUUID } from 'node:crypto';
import { users } from './users';

export const providerConfigs = pgTable(
  'provider_configs',
  {
    id: uuid('id').primaryKey().$defaultFn(() => randomUUID()),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    providerId: varchar('provider_id', { length: 100 }).notNull(),
    providerName: varchar('provider_name', { length: 100 }).notNull(),
    model: varchar('model', { length: 255 }).notNull(),
    encryptedKey: text('encrypted_key').notNull(),
    encryptedPrompt: text('encrypted_prompt'),
    active: boolean('active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().$defaultFn(() => new Date()),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().$defaultFn(() => new Date()).$onUpdate(() => new Date()),
  },
  (table) => ({
    userIdIdx: index('provider_configs_user_id_idx').on(table.userId),
  }),
);
