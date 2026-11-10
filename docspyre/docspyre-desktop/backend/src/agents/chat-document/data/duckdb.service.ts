import { DuckDBInstance, type DuckDBConnection } from '@duckdb/node-api';
import { env } from '../../../core/config';
import { logger } from '../../../core/utils/logger';
import { guardSelect, enforceRowLimit } from './sql-guard';

export type DatasetFormat = 'CSV' | 'TSV' | 'XLSX' | 'JSON' | 'PARQUET' | 'SQLITE' | 'DUCKDB';

export interface DatasetSource {
  /** Sanitised identifier the agent references in SQL. */
  tableName: string;
  /** Absolute path to the stored upload. */
  absolutePath: string;
  format: DatasetFormat;
  /** Worksheet for XLSX, or origin table name for DB files. */
  sheetName?: string | null;
}

export interface ColumnProfile {
  name: string;
  type: string;
  nullable: boolean;
  sampleValues: unknown[];
}

export interface TableProfile {
  tableName: string;
  sheetName: string | null;
  format: DatasetFormat;
  columns: ColumnProfile[];
  rowCount: number;
  sampleRows: Record<string, unknown>[];
}

export interface QueryResult {
  columns: string[];
  rows: Record<string, unknown>[];
  truncated: boolean;
  durationMs: number;
}

export class DatasetQueryError extends Error {
  constructor(message: string, readonly kind: 'REJECTED' | 'ERROR' | 'TIMEOUT') {
    super(message);
    this.name = 'DatasetQueryError';
  }
}

/** DuckDB string literal escaping: single quotes are doubled. */
const quoteLiteral = (value: string): string => `'${value.replace(/'/g, "''")}'`;

/** Double-quoted identifier escaping. */
const quoteIdentifier = (value: string): string => `"${value.replace(/"/g, '""')}"`;

/** Extensions loaded lazily; each requires one-time network access. */
const ensureExtension = async (conn: DuckDBConnection, name: string): Promise<void> => {
  try {
    await conn.run(`INSTALL ${name}`);
  } catch {
    // Already installed, or no network. LOAD below decides the outcome.
  }
  await conn.run(`LOAD ${name}`);
};

/**
 * Builds the SELECT that reads a source file. This SQL is constructed by us,
 * never by the model, which is why file-reading functions appear here.
 */
const readerFor = (source: DatasetSource): string => {
  const path = quoteLiteral(source.absolutePath);

  switch (source.format) {
    case 'CSV':
      return `SELECT * FROM read_csv(${path}, auto_detect=true, sample_size=-1, ignore_errors=true)`;
    case 'TSV':
      return `SELECT * FROM read_csv(${path}, delim='\\t', auto_detect=true, sample_size=-1, ignore_errors=true)`;
    case 'JSON':
      return `SELECT * FROM read_json_auto(${path})`;
    case 'PARQUET':
      return `SELECT * FROM read_parquet(${path})`;
    case 'XLSX':
      return source.sheetName
        ? `SELECT * FROM read_xlsx(${path}, sheet=${quoteLiteral(source.sheetName)}, all_varchar=false)`
        : `SELECT * FROM read_xlsx(${path}, all_varchar=false)`;
    case 'SQLITE':
    case 'DUCKDB':
      // Attached databases are handled separately in materialise().
      return `SELECT * FROM _attached.${quoteIdentifier(source.sheetName ?? 'main')}`;
  }
};

/**
 * Copies a source into an in-memory table. Materialising up front is what lets
 * us switch off external access before any model-authored SQL runs.
 */
const materialise = async (conn: DuckDBConnection, source: DatasetSource): Promise<void> => {
  if (source.format === 'XLSX') {
    await ensureExtension(conn, 'excel');
  }

  if (source.format === 'SQLITE' || source.format === 'DUCKDB') {
    if (source.format === 'SQLITE') await ensureExtension(conn, 'sqlite');

    const typeClause = source.format === 'SQLITE' ? ', TYPE sqlite' : '';
    await conn.run(
      `ATTACH ${quoteLiteral(source.absolutePath)} AS _attached (READ_ONLY${typeClause})`,
    );

    try {
      const origin = source.sheetName ?? 'main';
      await conn.run(
        `CREATE TABLE ${quoteIdentifier(source.tableName)} AS SELECT * FROM _attached.${quoteIdentifier(origin)}`,
      );
    } finally {
      await conn.run('DETACH _attached').catch(() => undefined);
    }
    return;
  }

  await conn.run(
    `CREATE TABLE ${quoteIdentifier(source.tableName)} AS ${readerFor(source)}`,
  );
};

interface Sandbox {
  conn: DuckDBConnection;
  close: () => void;
}

/**
 * Creates an isolated in-memory database holding copies of the given sources,
 * then disables all external access. Callers must always close the sandbox.
 */
const openSandbox = async (sources: DatasetSource[]): Promise<Sandbox> => {
  const instance = await DuckDBInstance.create(':memory:', {
    memory_limit: env.DUCKDB_MEMORY_LIMIT,
    threads: '2',
  });

  const conn = await instance.connect();
  let sealed = false;

  const close = (): void => {
    try {
      conn.disconnectSync();
    } catch {
      // Connection already gone.
    }
  };

  try {
    for (const source of sources) {
      await materialise(conn, source);
    }

    // Seal the sandbox: from here on the engine refuses file and network reads.
    await conn.run('SET enable_external_access=false');
    sealed = true;

    return { conn, close };
  } catch (error) {
    close();
    throw error;
  } finally {
    if (!sealed) {
      // Nothing else to do; `close` already ran on the error path.
    }
  }
};

/** Rejects a promise once the deadline passes so a runaway query cannot hang a request. */
const withDeadline = async <T>(work: Promise<T>, timeoutMs: number): Promise<T> => {
  let timer: NodeJS.Timeout | undefined;

  try {
    return await Promise.race([
      work,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(
          () => reject(new DatasetQueryError(`Query exceeded ${timeoutMs}ms`, 'TIMEOUT')),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
};

export const duckdbService = {
  /**
   * Reads column types, row counts and a small head sample for each source.
   * Used at ingest time to build the schema catalogue the SQL prompt needs.
   */
  async profile(sources: DatasetSource[]): Promise<TableProfile[]> {
    const sandbox = await openSandbox(sources);

    try {
      const profiles: TableProfile[] = [];

      for (const source of sources) {
        const table = quoteIdentifier(source.tableName);

        const described = await sandbox.conn.runAndReadAll(`DESCRIBE ${table}`);
        const describedRows = described.getRowObjectsJson() as {
          column_name: string;
          column_type: string;
          null: string;
        }[];

        const counted = await sandbox.conn.runAndReadAll(`SELECT count(*) AS n FROM ${table}`);
        const rowCount = Number((counted.getRowObjectsJson()[0] as { n: string | number }).n ?? 0);

        const sampled = await sandbox.conn.runAndReadAll(`SELECT * FROM ${table} LIMIT 5`);
        const sampleRows = sampled.getRowObjectsJson() as Record<string, unknown>[];

        const columns: ColumnProfile[] = describedRows.map((row) => ({
          name: row.column_name,
          type: row.column_type,
          nullable: String(row.null).toUpperCase() === 'YES',
          sampleValues: sampleRows
            .map((sample) => sample[row.column_name])
            .filter((value) => value !== null && value !== undefined)
            .slice(0, 3),
        }));

        profiles.push({
          tableName: source.tableName,
          sheetName: source.sheetName ?? null,
          format: source.format,
          columns,
          rowCount,
          sampleRows,
        });
      }

      return profiles;
    } finally {
      sandbox.close();
    }
  },

  /**
   * Lists the table names inside an attachable database file so each one can be
   * registered as its own dataset table.
   */
  async listDatabaseTables(absolutePath: string, format: 'SQLITE' | 'DUCKDB'): Promise<string[]> {
    const instance = await DuckDBInstance.create(':memory:', {
      memory_limit: env.DUCKDB_MEMORY_LIMIT,
      threads: '2',
    });
    const conn = await instance.connect();

    try {
      if (format === 'SQLITE') await ensureExtension(conn, 'sqlite');

      const typeClause = format === 'SQLITE' ? ', TYPE sqlite' : '';
      await conn.run(`ATTACH ${quoteLiteral(absolutePath)} AS _probe (READ_ONLY${typeClause})`);

      const result = await conn.runAndReadAll(
        `SELECT table_name FROM information_schema.tables WHERE table_catalog = '_probe'`,
      );

      return (result.getRowObjectsJson() as { table_name: string }[]).map((row) => row.table_name);
    } finally {
      try {
        conn.disconnectSync();
      } catch {
        // Already closed.
      }
    }
  },

  /**
   * Validates then executes model-generated SQL inside a fresh sandbox.
   * Throws DatasetQueryError with a `kind` the agent uses to decide on repair.
   */
  async execute(sources: DatasetSource[], rawSql: string): Promise<QueryResult> {
    const allowedTables = sources.map((source) => source.tableName);
    const guard = guardSelect(rawSql, allowedTables);

    if (!guard.ok || !guard.sql) {
      throw new DatasetQueryError(guard.reason ?? 'Statement rejected.', 'REJECTED');
    }

    const maxRows = env.DUCKDB_MAX_ROWS;
    const capped = enforceRowLimit(guard.sql, maxRows + 1);
    const startedAt = Date.now();
    const sandbox = await openSandbox(sources);

    try {
      const result = await withDeadline(
        sandbox.conn.runAndReadAll(capped),
        env.DUCKDB_QUERY_TIMEOUT_MS,
      );

      const columns = result.columnNames();
      const allRows = result.getRowObjectsJson() as Record<string, unknown>[];
      const truncated = allRows.length > maxRows;

      return {
        columns,
        rows: truncated ? allRows.slice(0, maxRows) : allRows,
        truncated,
        durationMs: Date.now() - startedAt,
      };
    } catch (error) {
      if (error instanceof DatasetQueryError) throw error;

      const message = error instanceof Error ? error.message : String(error);
      logger.debug('DuckDB query failed', { sql: capped, error: message });
      throw new DatasetQueryError(message, 'ERROR');
    } finally {
      sandbox.close();
    }
  },
};
