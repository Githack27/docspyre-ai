import { readFile } from 'node:fs/promises';
import { HumanMessage } from '@langchain/core/messages';
import { storagePath } from '../../documents/document.storage';
import { logger } from '../../../core/utils/logger';
import { createVisionModel, supportsVision } from '../llm/model.factory';
import { messageText } from '../llm/output';
import type { ResolvedProvider } from '../llm/provider-resolver.service';

/**
 * Prompt for turning an image into indexable text. The goal is a faithful,
 * literal description plus a verbatim transcription of any text, so downstream
 * retrieval and Q&A behave the same as they do for a document.
 */
const IMAGE_ANALYSIS_PROMPT = `You are analysing an image so its contents can be searched and answered about later. Produce a thorough, factual description. Do not speculate beyond what is visible.

Cover, where present:
- **Overview**: what the image is (photo, screenshot, chart, diagram, scan, form, etc.) and its subject.
- **Transcribed text**: every piece of readable text, verbatim, preserving labels, headings, numbers and units. If it is a table or form, reproduce it as a Markdown table with the same rows and columns.
- **Data**: for charts or graphs, state the chart type, axes, series, and the values or trends you can read.
- **Objects and layout**: notable objects, people (described generically, never identifying real individuals), their arrangement and any relationships.
- **Colours, annotations, and diagram structure** when they carry meaning.

Write in Markdown. Be complete but do not invent details that are not in the image. Do not add commentary about being an AI.`;

/** MIME types the vision models accept directly. */
const SUPPORTED_IMAGE_MIME = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'image/gif',
  'image/bmp',
]);

const EXTENSION_MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.bmp': 'image/bmp',
};

/** Resolves a usable image MIME type from the stored mime or the filename. */
const resolveImageMime = (mimeType: string, name: string): string | null => {
  const mime = (mimeType || '').toLowerCase().split(';')[0]?.trim() ?? '';
  if (SUPPORTED_IMAGE_MIME.has(mime)) return mime === 'image/jpg' ? 'image/jpeg' : mime;

  const ext = name.toLowerCase().slice(name.lastIndexOf('.'));
  return EXTENSION_MIME[ext] ?? null;
};

export const isImage = (mimeType: string, name: string): boolean =>
  resolveImageMime(mimeType, name) !== null;

/**
 * Builds a provider-correct image content block.
 *
 * The three vision providers each expect a different multimodal shape in their
 * LangChain JS clients:
 *  - Gemini: `image_url` as a plain data-URL string.
 *  - OpenAI: `image_url` as an object `{ url }`.
 *  - Anthropic: a `source` object with base64 media type and data.
 * Ollama uses the OpenAI-style object form.
 */
const buildImageBlock = (
  providerId: string,
  dataUrl: string,
  mime: string,
  base64: string,
): Record<string, unknown> => {
  switch (providerId) {
    case 'gemini':
      return { type: 'image_url', image_url: dataUrl };
    case 'anthropic':
      return {
        type: 'image',
        source: { type: 'base64', media_type: mime, data: base64 },
      };
    default:
      // OpenAI and Ollama.
      return { type: 'image_url', image_url: { url: dataUrl } };
  }
};

export const imageAnalysisService = {
  isImage,

  /**
   * Produces a textual description of an image using the provider's vision
   * model. Returns null when there is no usable vision model or the call fails,
   * so ingestion can degrade gracefully rather than break.
   */
  async describe(input: {
    storageKey: string;
    mimeType: string;
    name: string;
    provider: ResolvedProvider | null;
  }): Promise<string | null> {
    const mime = resolveImageMime(input.mimeType, input.name);
    if (!mime) return null;

    if (!input.provider || !supportsVision(input.provider)) {
      logger.warn('No vision-capable provider for image; skipping analysis', {
        name: input.name,
        provider: input.provider?.providerId ?? 'none',
      });
      return null;
    }

    try {
      const buffer = await readFile(storagePath(input.storageKey));
      const base64 = buffer.toString('base64');
      const dataUrl = `data:${mime};base64,${base64}`;

      const model = createVisionModel(input.provider, { temperature: 0.1, maxTokens: 2048 });

      const content = [
        { type: 'text', text: IMAGE_ANALYSIS_PROMPT },
        buildImageBlock(input.provider.providerId, dataUrl, mime, base64),
      ];

      // Providers accept differently-shaped multimodal blocks; the LangChain
      // content type does not model every variant, so cast at this boundary.
      const message = new HumanMessage({ content: content as never });

      const response = await model.invoke([message]);
      const text = messageText(response).trim();

      return text || null;
    } catch (error) {
      logger.error('Image analysis failed', {
        name: input.name,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  },
};
