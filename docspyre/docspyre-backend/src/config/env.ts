import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

/**
 * Central, validated configuration. The process refuses to boot with an
 * invalid environment, so misconfiguration fails fast and loudly instead of
 * surfacing as obscure runtime errors.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(8000),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  // Comma-separated list of allowed CORS origins (e.g. the Angular dev server).
  CORS_ORIGINS: z
    .string()
    .default('http://localhost:4200')
    .transform((value) => value.split(',').map((origin) => origin.trim())),

  // Secrets must be long enough to be meaningful. Use distinct values per env.
  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be >= 32 chars'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be >= 32 chars'),

  // Lifetimes use the `ms`/`jsonwebtoken` string format (e.g. 15m, 7d).
  ACCESS_TOKEN_TTL: z.string().default('15m'),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(7),

  BCRYPT_SALT_ROUNDS: z.coerce.number().int().min(10).max(15).default(12),

  COOKIE_DOMAIN: z.string().optional(),

  // Key used to encrypt sensitive configuration credentials (AES-256-GCM, must be 32 chars)
  ENCRYPTION_KEY: z.string().length(32, 'ENCRYPTION_KEY must be exactly 32 characters'),

  // Absolute or relative (to backend cwd) directory for uploaded file storage.
  UPLOAD_DIR: z.string().default('uploads'),
  // Hard cap for a single uploaded file (bytes). Default 100 MB.
  MAX_UPLOAD_BYTES: z.coerce.number().int().positive().default(104_857_600),
  // Days a soft-deleted document stays in Trash before permanent purge.
  TRASH_RETENTION_DAYS: z.coerce.number().int().positive().default(30),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error(
    'Invalid environment configuration:',
    parsed.error.flatten().fieldErrors,
  );
  process.exit(1);
}

export const env = parsed.data;
export const isProduction = env.NODE_ENV === 'production';
