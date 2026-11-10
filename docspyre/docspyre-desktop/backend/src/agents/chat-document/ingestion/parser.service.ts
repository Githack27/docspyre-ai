import { readFile } from 'node:fs/promises';
import { storagePath } from '../../../modules/documents/document.storage';
import { logger } from '../../../core/utils/logger';
import { imageAnalysisService, isImage } from './image-analysis.service';
import type { ResolvedProvider } from '../llm/provider-resolver.service';

export interface ParsedBlock {
  page: number;
  /** Heading trail for this block, outermost first. */
  sectionPath: string[];
  bbox: number[];
  type: 'heading' | 'text';
  text: string;
}

export interface ParseOptions {
  /** Provider used for vision analysis of image uploads. */
  provider?: ResolvedProvider | null;
}

/** Headings longer than this are almost certainly prose. */
const MAX_HEADING_CHARS = 120;
/** Depth cap so a malformed document cannot produce unbounded nesting. */
const MAX_HEADING_DEPTH = 4;

const NUMBERED_HEADING = /^(\d+(\.\d+)*)[.)]?\s+\S/;
const MARKDOWN_HEADING = /^(#{1,6})\s+(.+)$/;

/**
 * Heuristic heading detection. Section paths drive section-level summaries and
 * citation labels, so getting a usable structure out of flat text matters even
 * when the source format carries no styling.
 */
const classifyLine = (line: string): { isHeading: boolean; depth: number; text: string } => {
  const trimmed = line.trim();

  const markdown = trimmed.match(MARKDOWN_HEADING);
  if (markdown?.[1] && markdown[2]) {
    return {
      isHeading: true,
      depth: Math.min(markdown[1].length, MAX_HEADING_DEPTH),
      text: markdown[2].trim(),
    };
  }

  if (!trimmed || trimmed.length > MAX_HEADING_CHARS) {
    return { isHeading: false, depth: 0, text: trimmed };
  }

  const numbered = trimmed.match(NUMBERED_HEADING);
  if (numbered?.[1]) {
    const depth = Math.min(numbered[1].split('.').length, MAX_HEADING_DEPTH);
    return { isHeading: true, depth, text: trimmed };
  }

  // Sentence-like lines are body text, not headings.
  const endsLikeProse = /[.,;:]$/.test(trimmed);
  const words = trimmed.split(/\s+/);

  if (endsLikeProse || words.length > 14) {
    return { isHeading: false, depth: 0, text: trimmed };
  }

  const letters = trimmed.replace(/[^A-Za-z]/g, '');
  const isAllCaps = letters.length > 2 && letters === letters.toUpperCase();
  const isTitleCase =
    words.length > 1 &&
    words.filter((word) => /^[A-Z]/.test(word)).length >= Math.ceil(words.length * 0.6);

  if (isAllCaps || isTitleCase) {
    return { isHeading: true, depth: isAllCaps ? 1 : 2, text: trimmed };
  }

  return { isHeading: false, depth: 0, text: trimmed };
};

/** Splits raw page text into structured blocks with heading trails. */
const structurePage = (pageText: string, page: number): ParsedBlock[] => {
  const blocks: ParsedBlock[] = [];
  const headingStack: { depth: number; text: string }[] = [];

  const paragraphs = pageText
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  for (const paragraph of paragraphs) {
    const lines = paragraph.split('\n');
    const first = lines[0] ?? '';
    const classification = classifyLine(first);

    // A single-line paragraph that looks like a heading updates the trail.
    if (classification.isHeading && lines.length === 1) {
      while (
        headingStack.length &&
        (headingStack[headingStack.length - 1]?.depth ?? 0) >= classification.depth
      ) {
        headingStack.pop();
      }
      headingStack.push({ depth: classification.depth, text: classification.text });

      blocks.push({
        page,
        sectionPath: headingStack.map((entry) => entry.text),
        bbox: [],
        type: 'heading',
        text: classification.text,
      });
      continue;
    }

    blocks.push({
      page,
      sectionPath: headingStack.map((entry) => entry.text),
      bbox: [],
      type: 'text',
      text: paragraph.replace(/\s*\n\s*/g, ' ').trim(),
    });
  }

  return blocks;
};

export const parserService = {
  /** Converts a stored upload into structured text blocks. */
  async parse(
    storageKey: string,
    mimeType: string,
    name: string,
    options: ParseOptions = {},
  ): Promise<ParsedBlock[]> {
    const mime = (mimeType || '').toLowerCase();

    // Images have no extractable text; a vision model turns them into a
    // description that is then chunked and indexed like any other document.
    if (isImage(mimeType, name)) {
      const description = await imageAnalysisService.describe({
        storageKey,
        mimeType,
        name,
        provider: options.provider ?? null,
      });

      if (description) return structurePage(description, 1);

      // No vision model available: index the filename so the doc is at least
      // discoverable, and surface the limitation at answer time.
      return structurePage(
        `Image file: ${name}. No visual analysis was available for this image, so its contents could not be read.`,
        1,
      );
    }

    const buffer = await readFile(storagePath(storageKey));

    if (mime === 'application/pdf' || name.toLowerCase().endsWith('.pdf')) {
      return this.parsePdf(buffer);
    }

    if (mime.includes('word') || /\.docx?$/i.test(name)) {
      return this.parseDocx(buffer);
    }

    return structurePage(buffer.toString('utf-8'), 1);
  },

  async parsePdf(buffer: Buffer): Promise<ParsedBlock[]> {
    try {
      const module = await import('pdf-parse');
      const pdfParse = (module as unknown as { default: (b: Buffer) => Promise<{ text: string }> })
        .default;
      const parsed = await pdfParse(buffer);

      // pdf-parse emits a form feed between pages.
      const pages = parsed.text.split(/\f/);
      const blocks = pages.flatMap((pageText, index) => structurePage(pageText, index + 1));

      return blocks.length ? blocks : structurePage(parsed.text, 1);
    } catch (error) {
      logger.warn('PDF parsing failed, falling back to raw text', {
        error: error instanceof Error ? error.message : String(error),
      });
      return structurePage(buffer.toString('utf-8').slice(0, 200_000), 1);
    }
  },

  async parseDocx(buffer: Buffer): Promise<ParsedBlock[]> {
    try {
      const mammoth = await import('mammoth');
      const result = await mammoth.extractRawText({ buffer });
      return structurePage(result.value, 1);
    } catch (error) {
      logger.warn('DOCX parsing failed, falling back to raw text', {
        error: error instanceof Error ? error.message : String(error),
      });
      return structurePage(buffer.toString('utf-8').slice(0, 200_000), 1);
    }
  },
};
