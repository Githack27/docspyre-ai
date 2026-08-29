import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(8000),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  CORS_ORIGINS: z
    .string()
    .default('http://localhost:4200')
    .transform((value) => value.split(',').map((origin) => origin.trim())),

  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be >= 32 chars'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be >= 32 chars'),

  ACCESS_TOKEN_TTL: z.string().default('15m'),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(7),

  BCRYPT_SALT_ROUNDS: z.coerce.number().int().min(10).max(15).default(12),

  COOKIE_DOMAIN: z.string().optional(),

  ENCRYPTION_KEY: z.string().length(32, 'ENCRYPTION_KEY must be exactly 32 characters'),

  UPLOAD_DIR: z.string().default('uploads'),
  MAX_UPLOAD_BYTES: z.coerce.number().int().positive().default(104_857_600),
  TRASH_RETENTION_DAYS: z.coerce.number().int().positive().default(30),

  GEMINI_API_KEY: z.string().optional(),
  OLLAMA_BASE_URL: z.string().default('http://localhost:11434'),

  // ── Chat-with-document agent tuning ───────────────────────────────────────
  /** Grounding chunks passed to the answer prompt. */
  AGENT_MAX_CONTEXT_CHUNKS: z.coerce.number().int().positive().max(50).default(6),
  /** Verbatim conversation turns kept before older ones are summarised. */
  AGENT_HISTORY_TURNS: z.coerce.number().int().positive().max(50).default(6),
  /** Message count in a session that triggers rolling summarisation. */
  AGENT_SUMMARY_THRESHOLD: z.coerce.number().int().positive().default(12),
  /** Replay identical grounded questions from agent_runs. */
  AGENT_CACHE_ENABLED: z.coerce.boolean().default(true),
  /** Hard ceiling on text-to-SQL repair attempts. */
  AGENT_SQL_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(5).default(3),

  // ── DuckDB sandbox ────────────────────────────────────────────────────────
  DUCKDB_QUERY_TIMEOUT_MS: z.coerce.number().int().positive().default(15_000),
  DUCKDB_MAX_ROWS: z.coerce.number().int().positive().max(10_000).default(500),
  DUCKDB_MEMORY_LIMIT: z.string().default('512MB'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment configuration:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
export const isProduction = env.NODE_ENV === 'production';
