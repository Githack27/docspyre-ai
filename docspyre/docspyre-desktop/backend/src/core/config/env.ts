import dotenv from 'dotenv';
import { z } from 'zod';
import { ENCODED_SECRET_MINIMUM_LENGTH } from '../../constants/authConstants.js';
import { LICENSE_PORTAL_DEFAULTS, LICENSE_PORTAL_INSECURE_HOSTS } from '../../constants/licenseConstants.js';
import { POSTGRESQL_PROTOCOLS } from '../../constants/networkConstants.js';

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(0).max(65535).default(8000),

  DATABASE_URL: z.string().url().refine((value) => {
    const url = new URL(value);
    return POSTGRESQL_PROTOCOLS.some((protocol) => protocol === url.protocol) && url.pathname.length > 1;
  }, 'DATABASE_URL must be a PostgreSQL URL with a database name'),

  CORS_ORIGINS: z
    .string()
    .default('http://localhost:4200')
    .transform((value) => value.split(',').map((origin) => origin.trim())),

  AUTH_SESSION_SECRET: z.string().min(ENCODED_SECRET_MINIMUM_LENGTH),
  AUTH_SESSION_TTL_SECONDS: z.coerce.number().int().positive().default(2592000),

  LICENSE_PORTAL_URL: z
    .string()
    .url()
    .default(LICENSE_PORTAL_DEFAULTS.url)
    .refine((value) => {
      const url = new URL(value);
      return url.protocol === 'https:' || (url.protocol === 'http:' && LICENSE_PORTAL_INSECURE_HOSTS.includes(url.hostname));
    }, 'LICENSE_PORTAL_URL must use HTTPS unless it points to this machine'),

  LICENSE_PORTAL_PRODUCT_KEY: z.preprocess(
    (value) => (value === '' ? undefined : value),
    z.string().regex(/^dpk_[A-Za-z0-9_-]{43}$/, 'LICENSE_PORTAL_PRODUCT_KEY must be a dpk_ key issued by the License Portal').optional(),
  ),

  LICENSE_PORTAL_ISSUER: z.string().min(1).default(LICENSE_PORTAL_DEFAULTS.issuer),
  LICENSE_PORTAL_AUDIENCE: z.string().min(1).default(LICENSE_PORTAL_DEFAULTS.audience),
  LICENSE_PORTAL_TIMEOUT_MS: z.coerce.number().int().positive().default(LICENSE_PORTAL_DEFAULTS.timeoutMs),

  BCRYPT_SALT_ROUNDS: z.coerce.number().int().min(10).max(15).default(12),
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
