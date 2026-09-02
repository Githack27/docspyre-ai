/**
 * Static validation for model-generated SQL.
 *
 * This is the first of two independent controls. The second is the DuckDB
 * sandbox itself, which materialises data into an in-memory database and then
 * sets `enable_external_access=false`, so file and network reads are refused by
 * the engine regardless of what SQL arrives here. Neither control is trusted
 * alone.
 */

export interface SqlGuardResult {
  ok: boolean;
  /** Normalised statement, safe to execute. Present only when ok. */
  sql?: string;
  reason?: string;
}

/** Statements that mutate data, schema, extensions or engine configuration. */
const FORBIDDEN_KEYWORDS = [
  'insert', 'update', 'delete', 'merge', 'upsert', 'replace',
  'create', 'drop', 'alter', 'truncate', 'rename',
  'attach', 'detach', 'copy', 'export', 'import',
  'install', 'load', 'pragma', 'set', 'reset',
  'call', 'vacuum', 'checkpoint', 'analyze', 'transaction',
  'begin', 'commit', 'rollback', 'grant', 'revoke',
] as const;

/** Functions that reach outside the in-memory tables we registered. */
const FORBIDDEN_FUNCTIONS = [
  'read_csv', 'read_csv_auto', 'read_parquet', 'read_json', 'read_json_auto',
  'read_ndjson', 'read_ndjson_auto', 'read_text', 'read_blob', 'read_xlsx',
  'parquet_scan', 'csv_scan', 'json_scan', 'sniff_csv', 'glob',
  'postgres_scan', 'postgres_query', 'mysql_scan', 'mysql_query',
  'sqlite_scan', 'sqlite_query', 'delta_scan', 'iceberg_scan',
  'st_read', 'st_readosm', 'shell', 'system', 'getenv',
  'duckdb_extensions', 'duckdb_settings', 'load_aws_credentials',
] as const;

/** Removes comments so hidden payloads cannot evade token scanning. */
const stripComments = (sql: string): string =>
  sql
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/--[^\n\r]*/g, ' ');

/** Replaces literal contents with placeholders of the same shape. */
const maskStringLiterals = (sql: string): string =>
  sql.replace(/'(?:''|[^'])*'/g, "''");

/** Replaces quoted identifier contents, used only for token scanning. */
const maskQuotedIdentifiers = (sql: string): string =>
  sql.replace(/"(?:""|[^"])*"/g, '"id"');

/** Collects CTE names so they pass the table allowlist. */
const collectCteNames = (sql: string): string[] => {
  const names: string[] = [];
  const pattern = /(?:\bwith\b|,)\s*(?:recursive\s+)?("(?:""|[^"])*"|[A-Za-z_][\w$]*)\s+as\s*(?:materialized\s*|not\s+materialized\s*)?\(/gi;

  let match: RegExpExecArray | null;
  while ((match = pattern.exec(sql)) !== null) {
    const raw = match[1];
    if (raw) names.push(unquoteIdentifier(raw).toLowerCase());
  }
  return names;
};

/** Collects identifiers appearing in FROM / JOIN position. */
const collectTableRefs = (sql: string): string[] => {
  const refs: string[] = [];
  const pattern = /\b(?:from|join)\s+("(?:""|[^"])*"|[A-Za-z_][\w$]*)/gi;

  let match: RegExpExecArray | null;
  while ((match = pattern.exec(sql)) !== null) {
    const raw = match[1];
    if (!raw) continue;
    const name = unquoteIdentifier(raw).toLowerCase();
    // Table-producing keywords are not table names.
    if (name === 'lateral' || name === 'unnest' || name === 'values') continue;
    refs.push(name);
  }
  return refs;
};

const unquoteIdentifier = (raw: string): string =>
  raw.startsWith('"') && raw.endsWith('"') ? raw.slice(1, -1).replace(/""/g, '"') : raw;

/**
 * Validates a single read-only statement against an allowlist of table names.
 * Returns a reason string rather than throwing so the agent can attempt repair.
 */
export const guardSelect = (rawSql: string, allowedTables: string[]): SqlGuardResult => {
  if (!rawSql || !rawSql.trim()) {
    return { ok: false, reason: 'Empty statement.' };
  }

  // Models frequently wrap SQL in markdown fences; unwrap before validating.
  let sql = rawSql.trim();
  const fenced = sql.match(/^```(?:sql)?\s*([\s\S]*?)\s*```$/i);
  if (fenced?.[1]) sql = fenced[1].trim();

  sql = sql.replace(/;\s*$/, '').trim();
  if (!sql) return { ok: false, reason: 'Empty statement.' };

  const noComments = stripComments(sql);
  const literalsMasked = maskStringLiterals(noComments);
  const fullyMasked = maskQuotedIdentifiers(literalsMasked);

  if (fullyMasked.includes(';')) {
    return { ok: false, reason: 'Only a single statement is allowed.' };
  }

  if (!/^\s*(select|with)\b/i.test(fullyMasked)) {
    return { ok: false, reason: 'Statement must begin with SELECT or WITH.' };
  }

  for (const keyword of FORBIDDEN_KEYWORDS) {
    // `replace` and `set` are also legitimate scalar/aggregate constructs, so
    // only flag them in statement position (followed by whitespace, not `(`).
    const pattern = new RegExp(`\\b${keyword}\\s+(?!\\()`, 'i');
    if (pattern.test(fullyMasked)) {
      return { ok: false, reason: `Disallowed keyword: ${keyword.toUpperCase()}.` };
    }
  }

  for (const fn of FORBIDDEN_FUNCTIONS) {
    const pattern = new RegExp(`\\b${fn}\\s*\\(`, 'i');
    if (pattern.test(fullyMasked)) {
      return { ok: false, reason: `Disallowed function: ${fn}().` };
    }
  }

  const allowed = new Set([
    ...allowedTables.map((name) => name.toLowerCase()),
    ...collectCteNames(literalsMasked),
  ]);

  for (const ref of collectTableRefs(literalsMasked)) {
    if (!allowed.has(ref)) {
      return {
        ok: false,
        reason: `Unknown table "${ref}". Available tables: ${allowedTables.join(', ')}.`,
      };
    }
  }

  return { ok: true, sql };
};

/**
 * Appends a LIMIT when the statement has none and is not a bare aggregate.
 * Prevents a stray `SELECT *` from streaming an entire dataset into a prompt.
 */
export const enforceRowLimit = (sql: string, maxRows: number): string => {
  const masked = maskQuotedIdentifiers(maskStringLiterals(stripComments(sql)));
  if (/\blimit\s+\d+/i.test(masked)) return sql;
  return `SELECT * FROM (\n${sql}\n) AS _capped LIMIT ${maxRows}`;
};
