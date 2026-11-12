import { pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  username: varchar('username', { length: 100 }).unique(),
  name: varchar('name', { length: 255 }).notNull(),
  passwordHash: text('password_hash'),
  avatarUrl: text('avatar_url'),
  status: varchar('status', { length: 50 }).notNull().default('active'),
  // Identity and license issued by the DETQEL License Portal. The portal is the source of truth;
  // these columns hold the last verified copy so each request is checked locally.
  portalUserId: uuid('portal_user_id').unique(),
  firstName: varchar('first_name', { length: 60 }),
  lastName: varchar('last_name', { length: 60 }),
  companyName: varchar('company_name', { length: 120 }),
  country: varchar('country', { length: 2 }),
  state: varchar('state', { length: 120 }),
  licenseId: uuid('license_id'),
  licenseType: varchar('license_type', { length: 30 }),
  licenseBilling: varchar('license_billing', { length: 20 }),
  licenseName: varchar('license_name', { length: 80 }),
  licenseToken: text('license_token'),
  /** When the current license token expires; gates every request and forces a portal re-check. */
  licenseExpiresAt: timestamp('license_expires_at', { withTimezone: true }),
  /** When the license itself ends on the portal (null: no expiry). Shown to the user as days remaining. */
  licenseEndsAt: timestamp('license_ends_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
