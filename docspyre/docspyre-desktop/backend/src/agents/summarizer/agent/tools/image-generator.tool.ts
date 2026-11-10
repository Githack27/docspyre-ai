import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { env } from '../../../../core/config';
import { logger } from '../../../../core/utils/logger';
import type { ResolvedProvider } from '../../../chat-document/llm/provider-resolver.service';

const UPLOAD_ROOT = path.isAbsolute(env.UPLOAD_DIR)
  ? env.UPLOAD_DIR
  : path.resolve(process.cwd(), env.UPLOAD_DIR);

const IMAGES_DIR = path.join(UPLOAD_ROOT, 'notes-images');

export async function ensureNotesImagesDir(): Promise<void> {
  if (!existsSync(IMAGES_DIR)) {
    await mkdir(IMAGES_DIR, { recursive: true });
  }
}

export interface GeneratedImageResult {
  id: string;
  storageKey: string;
  url: string;
  caption: string;
}

export const imageGeneratorTool = {
  async generate(input: {
    prompt: string;
    caption?: string;
    provider?: ResolvedProvider | null;
  }): Promise<GeneratedImageResult | null> {
    await ensureNotesImagesDir();
    const id = randomUUID();
    const prompt = input.prompt.trim();
    if (!prompt) return null;

    logger.info('Generating visual image for notes manual', { prompt: prompt.slice(0, 80) });

    // 1. Try Gemini Imagen if Gemini API key exists
    if (input.provider?.providerId === 'gemini' && input.provider.apiKey) {
      try {
        const geminiResult = await generateWithGeminiImagen(input.provider.apiKey, prompt);
        if (geminiResult) {
          const storageKey = `img-${id}.jpeg`;
          await writeFile(path.join(IMAGES_DIR, storageKey), geminiResult);
          return {
            id,
            storageKey,
            url: `/api/v1/summarizer/images/${storageKey}`,
            caption: input.caption || prompt,
          };
        }
      } catch (err) {
        logger.warn('Gemini Imagen generation failed, proceeding to fallback', {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // 2. Try OpenAI DALL-E if OpenAI provider
    if (input.provider?.providerId === 'openai' && input.provider.apiKey) {
      try {
        const openAiResult = await generateWithOpenAIDallE(input.provider.apiKey, prompt);
        if (openAiResult) {
          const storageKey = `img-${id}.png`;
          await writeFile(path.join(IMAGES_DIR, storageKey), openAiResult);
          return {
            id,
            storageKey,
            url: `/api/v1/summarizer/images/${storageKey}`,
            caption: input.caption || prompt,
          };
        }
      } catch (err) {
        logger.warn('OpenAI DALL-E generation failed, proceeding to fallback', {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // 3. Fallback: High-res AI illustration via Pollinations
    try {
      const pollinationsResult = await generateWithPollinations(prompt);
      if (pollinationsResult) {
        const storageKey = `img-${id}.jpg`;
        await writeFile(path.join(IMAGES_DIR, storageKey), pollinationsResult);
        return {
          id,
          storageKey,
          url: `/api/v1/summarizer/images/${storageKey}`,
          caption: input.caption || prompt,
        };
      }
    } catch (err) {
      logger.warn('Pollinations fallback failed, generating SVG schematic', {
        error: err instanceof Error ? err.message : String(err),
      });
    }

    // 4. Ultimate offline fallback: SVG diagram
    const svgContent = generateSvgDiagram(input.caption || prompt);
    const storageKey = `img-${id}.svg`;
    await writeFile(path.join(IMAGES_DIR, storageKey), Buffer.from(svgContent, 'utf-8'));
    return {
      id,
      storageKey,
      url: `/api/v1/summarizer/images/${storageKey}`,
      caption: input.caption || prompt,
    };
  },
};

async function generateWithGeminiImagen(apiKey: string, prompt: string): Promise<Buffer | null> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-002:predict?key=${apiKey}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      instances: [
        {
          prompt: `Technical manual diagram, clean modern infographic illustration, high resolution, professional presentation: ${prompt}`,
        },
      ],
      parameters: {
        sampleCount: 1,
        aspectRatio: '16:9',
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`Imagen HTTP ${response.status}: ${await response.text()}`);
  }

  const json = (await response.json()) as {
    predictions?: Array<{ bytesBase64Encoded?: string }>;
  };

  const b64 = json.predictions?.[0]?.bytesBase64Encoded;
  if (b64) {
    return Buffer.from(b64, 'base64');
  }
  return null;
}

async function generateWithOpenAIDallE(apiKey: string, prompt: string): Promise<Buffer | null> {
  const url = 'https://api.openai.com/v1/images/generations';
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'dall-e-3',
      prompt: `Technical manual schematic illustration, clean modern vector diagram, clear typography and infographic layout: ${prompt}`,
      n: 1,
      size: '1024x1024',
      response_format: 'b64_json',
    }),
  });

  if (!response.ok) {
    throw new Error(`DALL-E HTTP ${response.status}: ${await response.text()}`);
  }

  const json = (await response.json()) as { data?: Array<{ b64_json?: string }> };
  const b64 = json.data?.[0]?.b64_json;
  if (b64) {
    return Buffer.from(b64, 'base64');
  }
  return null;
}

async function generateWithPollinations(prompt: string): Promise<Buffer | null> {
  const cleanPrompt = encodeURIComponent(
    `professional technical manual infographic, clear diagrams, modern minimal vector art: ${prompt.slice(0, 200)}`,
  );
  const url = `https://image.pollinations.ai/prompt/${cleanPrompt}?width=960&height=540&nologo=true`;
  const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!response.ok) return null;
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

function generateSvgDiagram(title: string): string {
  const safeTitle = title.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 360" width="100%" height="100%">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#18181b"/>
      <stop offset="100%" stop-color="#27272a"/>
    </linearGradient>
    <linearGradient id="accent" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#8b5cf6"/>
      <stop offset="100%" stop-color="#06b6d4"/>
    </linearGradient>
  </defs>
  <rect width="800" height="360" rx="16" fill="url(#bg)" stroke="#3f3f46" stroke-width="1.5"/>
  <circle cx="60" cy="50" r="14" fill="#8b5cf6" opacity="0.2"/>
  <circle cx="60" cy="50" r="6" fill="#8b5cf6"/>
  <text x="88" y="55" fill="#a1a1aa" font-family="system-ui, sans-serif" font-size="13" font-weight="600" letter-spacing="1">SYSTEM CONCEPT / VISUAL DIAGRAM</text>
  <line x1="40" y1="80" x2="760" y2="80" stroke="#3f3f46" stroke-width="1"/>
  <rect x="60" y="110" width="200" height="180" rx="12" fill="#27272a" stroke="#52525b" stroke-width="1.2"/>
  <text x="80" y="145" fill="#a78bfa" font-family="system-ui, sans-serif" font-size="14" font-weight="700">INPUT ARCHITECTURE</text>
  <text x="80" y="175" fill="#d4d4d8" font-family="system-ui, sans-serif" font-size="12">• Structured Ingestion</text>
  <text x="80" y="200" fill="#d4d4d8" font-family="system-ui, sans-serif" font-size="12">• Chunk Identification</text>
  <text x="80" y="225" fill="#d4d4d8" font-family="system-ui, sans-serif" font-size="12">• Context Serialization</text>
  <line x1="260" y1="200" x2="300" y2="200" stroke="#06b6d4" stroke-width="2" marker-end="url(#arrow)"/>
  <rect x="300" y="110" width="200" height="180" rx="12" fill="#27272a" stroke="#06b6d4" stroke-width="1.5"/>
  <text x="320" y="145" fill="#22d3ee" font-family="system-ui, sans-serif" font-size="14" font-weight="700">CORE PROCESSING</text>
  <text x="320" y="175" fill="#d4d4d8" font-family="system-ui, sans-serif" font-size="12">• LangGraph Nodes</text>
  <text x="320" y="200" fill="#d4d4d8" font-family="system-ui, sans-serif" font-size="12">• DB State Ref Fetching</text>
  <text x="320" y="225" fill="#d4d4d8" font-family="system-ui, sans-serif" font-size="12">• Model Synthesis</text>
  <line x1="500" y1="200" x2="540" y2="200" stroke="#8b5cf6" stroke-width="2"/>
  <rect x="540" y="110" width="200" height="180" rx="12" fill="#27272a" stroke="#8b5cf6" stroke-width="1.5"/>
  <text x="560" y="145" fill="#c084fc" font-family="system-ui, sans-serif" font-size="14" font-weight="700">PUBLISHED MANUAL</text>
  <text x="560" y="175" fill="#d4d4d8" font-family="system-ui, sans-serif" font-size="12">• Titles &amp; Subtitles</text>
  <text x="560" y="200" fill="#d4d4d8" font-family="system-ui, sans-serif" font-size="12">• Markdown Tables</text>
  <text x="560" y="225" fill="#d4d4d8" font-family="system-ui, sans-serif" font-size="12">• PDF Ready Notes</text>
  <text x="400" y="325" fill="#e4e4e7" font-family="system-ui, sans-serif" font-size="13" font-weight="500" text-anchor="middle">${safeTitle.slice(0, 90)}</text>
</svg>`;
}
