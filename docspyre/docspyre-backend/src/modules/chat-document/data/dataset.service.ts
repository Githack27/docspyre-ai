import path from 'node:path';
import { db, eq, datasetTables } from '@docspyre/database';
import { logger } from '../../../core/utils/logger';
import { storagePath, storageExists } from '../../documents/document.storage';
import { duckdbService, type DatasetFormat, type DatasetSource } from './duckdb.service';
import { createChatModel } from '../llm/model.factory';
import { DATASET_DESCRIPTION_SYSTEM, buildDatasetDescriptionPrompt } from '../agent/prompts';
import type { ResolvedProvider } from '../llm/provider-resolver.service';

/** Column shape consumed by the text-to-SQL prompt. */
export interface DatasetColumn {
  name: string;
  type: string;
  nullable?: boolean;
  sampleValues?: unknown[];
}

/** Table profile handed to the agent so it can write correct SQL. */
export interface DatasetSchema {
  tableName: string;
  sheetName: string | null;
  format: DatasetFormat;
  rowCount: number | null;
  columns: DatasetColumn[];
  description: string | null;
}

const EXTENSION_FORMATS: Record<string, DatasetFormat> = {
  '.csv': 'CSV',
  '.tsv': 'TSV',
  '.tab': 'TSV',
  '.xlsx': 'XLSX',
  '.xlsm': 'XLSX',
  '.json': 'JSON',
  '.jsonl': 'JSON',
  '.ndjson': 'JSON',
  '.parquet': 'PARQUET',
  '.duckdb': 'DUCKDB',
  '.ddb': 'DUCKDB',
  '.sqlite': 'SQLITE',
  '.sqlite3': 'SQLITE',
  '.db': 'SQLITE',
};

const MIME_FORMATS: Record<string, DatasetFormat> = {
  'text/csv': 'CSV',
  'text/tab-separated-values': 'TSV',
  'application/json': 'JSON',
  'application/x-ndjson': 'JSON',
  'application/vnd.ms-excel': 'XLSX',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'XLSX',
  'application/vnd.apache.parquet': 'PARQUET',
  'application/x-parquet': 'PARQUET',
  'application/vnd.sqlite3': 'SQLITE',
  'application/x-sqlite3': 'SQLITE',
};

/**
 * Classifies an upload as a queryable data source. Extension wins over MIME
 * because browsers report inconsistent types for CSV and Parquet.
 */
export const detectDatasetFormat = (name: string, mimeType: string): DatasetFormat | null => {
  const extension = path.extname(name).toLowerCase();
  if (EXTENSION_FORMATS[extension]) return EXTENSION_FORMATS[extension];

  const mime = (mimeType || '').toLowerCase().split(';')[0]?.trim() ?? '';
  return MIME_FORMATS[mime] ?? null;
};

/** Produces a SQL-safe, readable identifier from arbitrary text. */
const toTableName = (raw: string): string => {
  const base = raw
    .toLowerCase()
    .replace(/\.[a-z0-9]+$/i, '')
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/^(\d)/, 't_$1')
    .slice(0, 60);

  return base || 'dataset';
};

/** Ensures generated names stay unique within one document. */
const uniquify = (name: string, taken: Set<string>): string => {
  if (!taken.has(name)) {
    taken.add(name);
    return name;
  }

  for (let suffix = 2; suffix < 100; suffix += 1) {
    const candidate = `${name}_${suffix}`;
    if (!taken.has(candidate)) {
      taken.add(candidate);
      return candidate;
    }
  }

  const fallback = `${name}_${Date.now()}`;
  taken.add(fallback);
  return fallback;
};

/** Best-effort natural-language table description; never blocks ingestion. */
const describeTable = async (
  provider: ResolvedProvider | null,
  input: { tableName: string; columns: DatasetColumn[]; rowCount: number | null },
): Promise<string | null> => {
  if (!provider) return null;

  try {
    const model = createChatModel(provider, { temperature: 0.1, maxTokens: 400 });
    const response = await model.invoke([
      { role: 'system', content: DATASET_DESCRIPTION_SYSTEM },
      { role: 'user', content: buildDatasetDescriptionPrompt(input) },
    ]);

    const text = typeof response.content === 'string' ? response.content : '';
    return text.trim() || null;
  } catch (error) {
    logger.debug('Dataset description generation skipped', {
      table: input.tableName,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
};

/** Enumerates the logical tables a single file contains. */
const resolveSources = async (
  documentName: string,
  storageKey: string,
  format: DatasetFormat,
): Promise<DatasetSource[]> => {
  const absolutePath = storagePath(storageKey);
  const taken = new Set<string>();

  if (format === 'SQLITE' || format === 'DUCKDB') {
    const tables = await duckdbService.listDatabaseTables(absolutePath, format);

    if (!tables.length) return [];

    return tables.map((table) => ({
      tableName: uniquify(toTableName(table), taken),
      absolutePath,
      format,
      sheetName: table,
    }));
  }

  return [
    {
      tableName: uniquify(toTableName(documentName), taken),
      absolutePath,
      format,
      sheetName: null,
    },
  ];
};

export const datasetService = {
  detectDatasetFormat,

  /**
   * Profiles a data file and records its schema. Returns the number of tables
   * registered; zero means the file is not usable as a data source and the
   * caller should rely on text extraction alone.
   */
  async profileDocument(input: {
    documentId: string;
    name: string;
    mimeType: string;
    storageKey: string;
    provider: ResolvedProvider | null;
  }): Promise<number> {
    const format = detectDatasetFormat(input.name, input.mimeType);
    if (!format) return 0;

    if (!storageExists(input.storageKey)) {
      logger.warn('Dataset profiling skipped, file missing', { documentId: input.documentId });
      return 0;
    }

    let sources: DatasetSource[];
    try {
      sources = await resolveSources(input.name, input.storageKey, format);
    } catch (error) {
      logger.warn('Dataset source resolution failed', {
        documentId: input.documentId,
        format,
        error: error instanceof Error ? error.message : String(error),
      });
      return 0;
    }

    if (!sources.length) return 0;

    let profiles;
    try {
      profiles = await duckdbService.profile(sources);
    } catch (error) {
      // Unreadable or unsupported variant (e.g. legacy .xls, missing extension).
      logger.warn('Dataset profiling failed, falling back to text only', {
        documentId: input.documentId,
        format,
        error: error instanceof Error ? error.message : String(error),
      });
      return 0;
    }

    // Re-profiling replaces the previous catalogue for this document.
    await db.delete(datasetTables).where(eq(datasetTables.documentId, input.documentId));

    for (const profile of profiles) {
      const columns: DatasetColumn[] = profile.columns.map((column) => ({
        name: column.name,
        type: column.type,
        nullable: column.nullable,
        sampleValues: column.sampleValues,
      }));

      const description = await describeTable(input.provider, {
        tableName: profile.tableName,
        columns,
        rowCount: profile.rowCount,
      });

      await db.insert(datasetTables).values({
        documentId: input.documentId,
        tableName: profile.tableName,
        sourceFormat: profile.format,
        sheetName: profile.sheetName,
        columns,
        rowCount: profile.rowCount,
        sampleRows: profile.sampleRows,
        description,
      });
    }

    logger.info('Dataset profiled', {
      documentId: input.documentId,
      format,
      tables: profiles.length,
    });

    return profiles.length;
  },

  /** Schema catalogue for the text-to-SQL prompt. Empty when not a dataset. */
  async getSchemas(documentId: string): Promise<DatasetSchema[]> {
    const rows = await db
      .select()
      .from(datasetTables)
      .where(eq(datasetTables.documentId, documentId));

    return rows.map((row) => ({
      tableName: row.tableName,
      sheetName: row.sheetName,
      format: row.sourceFormat as DatasetFormat,
      rowCount: row.rowCount ?? null,
      columns: (row.columns as DatasetColumn[]) ?? [],
      description: row.description ?? null,
    }));
  },

  /** Execution handles for the DuckDB sandbox. */
  async getSources(documentId: string, storageKey: string): Promise<DatasetSource[]> {
    const rows = await db
      .select()
      .from(datasetTables)
      .where(eq(datasetTables.documentId, documentId));

    const absolutePath = storagePath(storageKey);

    return rows.map((row) => ({
      tableName: row.tableName,
      absolutePath,
      format: row.sourceFormat as DatasetFormat,
      sheetName: row.sheetName,
    }));
  },

  async hasDataset(documentId: string): Promise<boolean> {
    const [row] = await db
      .select({ id: datasetTables.id })
      .from(datasetTables)
      .where(eq(datasetTables.documentId, documentId))
      .limit(1);
    return Boolean(row);
  },
};
