import { db, eq, and, documentSummaries } from '@docspyre/database';
import { logger } from '../../../core/utils/logger';
import { createChatModel, describeModel } from '../llm/model.factory';
import { messageText, extractJson } from '../llm/output';
import type { ResolvedProvider } from '../llm/provider-resolver.service';
import {
  DOCUMENT_SUMMARY_SYSTEM,
  SECTION_SUMMARY_SYSTEM,
  buildDocumentSummaryPrompt,
  buildSectionSummaryPrompt,
} from '../agent/prompts';

/** Total characters of excerpt sent to the document-level summariser. */
const DOCUMENT_EXCERPT_BUDGET = 24_000;
/** Characters per individual excerpt slice. */
const EXCERPT_SLICE = 2_000;
/** Upper bound on section summaries so ingestion cost stays predictable. */
const MAX_SECTIONS = 12;
/** Minimum section length worth summarising. */
const MIN_SECTION_CHARS = 400;

export interface SummarisableChunk {
  text: string;
  page: number;
  sectionPath: string[];
  chunkType: string;
}

interface DocumentSummaryPayload {
  summary?: unknown;
  keyPoints?: unknown;
  entities?: unknown;
}

export interface DocumentSummaryRecord {
  summary: string;
  keyPoints: string[];
  entities: string[];
}

export interface SectionSummaryRecord {
  heading: string;
  summary: string;
  page: number | null;
}

/**
 * Picks excerpts spread across the document rather than just the opening pages,
 * so the summary reflects the whole file within a fixed character budget.
 */
const selectExcerpts = (chunks: SummarisableChunk[]): string[] => {
  if (!chunks.length) return [];

  const slices: string[] = [];
  const maxSlices = Math.max(1, Math.floor(DOCUMENT_EXCERPT_BUDGET / EXCERPT_SLICE));
  const step = Math.max(1, Math.floor(chunks.length / maxSlices));

  for (let i = 0; i < chunks.length && slices.length < maxSlices; i += step) {
    const text = chunks[i]?.text?.trim();
    if (text) slices.push(text.slice(0, EXCERPT_SLICE));
  }

  return slices;
};

/** Groups chunks under their nearest heading. */
const groupSections = (chunks: SummarisableChunk[]): { heading: string; text: string; page: number | null }[] => {
  const groups = new Map<string, { heading: string; text: string; page: number | null }>();

  for (const chunk of chunks) {
    const heading = chunk.sectionPath?.filter(Boolean).join(' > ') || '';
    if (!heading) continue;

    const existing = groups.get(heading);
    if (existing) {
      existing.text = `${existing.text}\n${chunk.text}`.slice(0, 8_000);
    } else {
      groups.set(heading, { heading, text: chunk.text.slice(0, 8_000), page: chunk.page ?? null });
    }
  }

  return [...groups.values()]
    .filter((group) => group.text.trim().length >= MIN_SECTION_CHARS)
    .slice(0, MAX_SECTIONS);
};

const asStringArray = (value: unknown, limit: number): string[] => {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    .map((item) => item.trim())
    .slice(0, limit);
};

/**
 * Deterministic fallback used when no model is reachable. A truncated opening
 * extract is less useful than a real summary but keeps the feature functional.
 */
const fallbackSummary = (chunks: SummarisableChunk[]): DocumentSummaryRecord => {
  const text = chunks
    .slice(0, 3)
    .map((chunk) => chunk.text.trim())
    .join(' ')
    .replace(/\s+/g, ' ')
    .slice(0, 900);

  return { summary: text, keyPoints: [], entities: [] };
};

export const summarizerService = {
  /**
   * Generates and stores document-level and section-level summaries. Failures
   * are contained: ingestion continues with whatever was produced.
   */
  async summarizeDocument(input: {
    documentId: string;
    name: string;
    chunks: SummarisableChunk[];
    provider: ResolvedProvider | null;
  }): Promise<void> {
    if (!input.chunks.length) return;

    const modelLabel = input.provider ? describeModel(input.provider) : null;
    const record = await this.buildDocumentSummary(input.name, input.chunks, input.provider);

    await db
      .delete(documentSummaries)
      .where(eq(documentSummaries.documentId, input.documentId));

    await db.insert(documentSummaries).values({
      documentId: input.documentId,
      scope: 'DOCUMENT',
      scopeKey: '',
      sectionPath: [],
      summary: record.summary,
      keyPoints: record.keyPoints,
      entities: record.entities,
      tokenCount: Math.ceil(record.summary.length / 4),
      model: modelLabel,
    });

    if (!input.provider) return;

    const sections = groupSections(input.chunks);
    if (!sections.length) return;

    const model = createChatModel(input.provider, { temperature: 0.1, maxTokens: 500 });

    for (const section of sections) {
      try {
        const response = await model.invoke([
          { role: 'system', content: SECTION_SUMMARY_SYSTEM },
          { role: 'user', content: buildSectionSummaryPrompt(section) },
        ]);

        const summary = messageText(response).trim();
        if (!summary) continue;

        await db.insert(documentSummaries).values({
          documentId: input.documentId,
          scope: 'SECTION',
          scopeKey: section.heading.slice(0, 512),
          sectionPath: section.heading.split(' > ').filter(Boolean),
          page: section.page,
          summary,
          keyPoints: [],
          entities: [],
          tokenCount: Math.ceil(summary.length / 4),
          model: modelLabel,
        });
      } catch (error) {
        logger.debug('Section summary skipped', {
          documentId: input.documentId,
          section: section.heading,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  },

  /** Produces the document-level record without persisting it. */
  async buildDocumentSummary(
    name: string,
    chunks: SummarisableChunk[],
    provider: ResolvedProvider | null,
  ): Promise<DocumentSummaryRecord> {
    if (!provider) return fallbackSummary(chunks);

    const excerpts = selectExcerpts(chunks);
    if (!excerpts.length) return fallbackSummary(chunks);

    try {
      const model = createChatModel(provider, { temperature: 0.1, maxTokens: 1200 });
      const response = await model.invoke([
        { role: 'system', content: DOCUMENT_SUMMARY_SYSTEM },
        { role: 'user', content: buildDocumentSummaryPrompt({ documentName: name, excerpts }) },
      ]);

      const raw = messageText(response);
      const parsed = extractJson<DocumentSummaryPayload>(raw);

      const summary =
        typeof parsed?.summary === 'string' && parsed.summary.trim()
          ? parsed.summary.trim()
          : raw.trim().slice(0, 1_200);

      if (!summary) return fallbackSummary(chunks);

      return {
        summary,
        keyPoints: asStringArray(parsed?.keyPoints, 7),
        entities: asStringArray(parsed?.entities, 12),
      };
    } catch (error) {
      logger.warn('Document summarisation failed, using extract fallback', {
        error: error instanceof Error ? error.message : String(error),
      });
      return fallbackSummary(chunks);
    }
  },

  /** Document-level summary for prompt context. */
  async getDocumentSummary(documentId: string): Promise<DocumentSummaryRecord | null> {
    const [row] = await db
      .select()
      .from(documentSummaries)
      .where(
        and(eq(documentSummaries.documentId, documentId), eq(documentSummaries.scope, 'DOCUMENT')),
      )
      .limit(1);

    if (!row) return null;

    return {
      summary: row.summary,
      keyPoints: row.keyPoints ?? [],
      entities: row.entities ?? [],
    };
  },

  async getSectionSummaries(documentId: string): Promise<SectionSummaryRecord[]> {
    const rows = await db
      .select()
      .from(documentSummaries)
      .where(
        and(eq(documentSummaries.documentId, documentId), eq(documentSummaries.scope, 'SECTION')),
      );

    return rows.map((row) => ({
      heading: row.scopeKey,
      summary: row.summary,
      page: row.page ?? null,
    }));
  },
};
