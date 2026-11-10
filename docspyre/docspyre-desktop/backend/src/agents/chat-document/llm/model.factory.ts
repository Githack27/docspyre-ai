import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { ChatOpenAI } from '@langchain/openai';
import { ChatAnthropic } from '@langchain/anthropic';
import { ChatOllama } from '@langchain/ollama';
import { env } from '../../../core/config';
import type { ResolvedProvider } from './provider-resolver.service';

/** Cohere exposes an OpenAI-compatible surface, so it reuses the OpenAI client. */
const COHERE_OPENAI_BASE_URL = 'https://api.cohere.ai/compatibility/v1';

const DEFAULT_MODELS: Record<ResolvedProvider['providerId'], string> = {
  gemini: 'gemini-flash-latest',
  openai: 'gpt-4o-mini',
  anthropic: 'claude-3-5-sonnet-latest',
  cohere: 'command-r-plus',
  ollama: 'llama3.2',
};

/**
 * Providers whose models are multimodal. Gemini, OpenAI (4o family), Anthropic
 * (Claude 3+) and Ollama (with a vision model) accept images. Cohere's chat
 * models here do not, so image analysis is unavailable on Cohere.
 */
const VISION_CAPABLE: ReadonlySet<ResolvedProvider['providerId']> = new Set([
  'gemini',
  'openai',
  'anthropic',
  'ollama',
]);

/**
 * Fallback vision model used ONLY when the user has not configured a model for
 * the provider. When the user has chosen a model, that choice is respected —
 * modern Gemini/OpenAI/Anthropic chat models are all multimodal.
 */
const VISION_FALLBACK: Partial<Record<ResolvedProvider['providerId'], string>> = {
  gemini: 'gemini-flash-latest',
  openai: 'gpt-4o',
  anthropic: 'claude-3-5-sonnet-latest',
  ollama: 'llava',
};

/** Whether a provider can analyse images at all. */
export const supportsVision = (provider: ResolvedProvider): boolean =>
  VISION_CAPABLE.has(provider.providerId);

/**
 * Builds a vision-capable chat model. Uses the user's configured model as-is;
 * only substitutes a known multimodal model when none is configured.
 */
export const createVisionModel = (
  provider: ResolvedProvider,
  options: ModelOptions = {},
): BaseChatModel => {
  const model = provider.model?.trim() || VISION_FALLBACK[provider.providerId] || '';
  return createChatModel({ ...provider, model }, options);
};

export interface ModelOptions {
  /** Lower values for extraction/SQL, higher for synthesis. */
  temperature?: number;
  maxTokens?: number;
}

/**
 * Builds a LangChain chat model for a resolved provider. Every graph node goes
 * through here so provider selection, defaults and timeouts live in one place.
 */
export const createChatModel = (
  provider: ResolvedProvider,
  options: ModelOptions = {},
): BaseChatModel => {
  const temperature = options.temperature ?? 0.1;
  const maxTokens = options.maxTokens ?? 4096;
  const model = provider.model?.trim() || DEFAULT_MODELS[provider.providerId];

  switch (provider.providerId) {
    case 'gemini':
      return new ChatGoogleGenerativeAI({
        model,
        apiKey: provider.apiKey,
        temperature,
        maxOutputTokens: maxTokens,
      });

    case 'openai':
      return new ChatOpenAI({
        model,
        apiKey: provider.apiKey,
        temperature,
        maxTokens,
      });

    case 'cohere':
      return new ChatOpenAI({
        model,
        apiKey: provider.apiKey,
        temperature,
        maxTokens,
        configuration: { baseURL: COHERE_OPENAI_BASE_URL },
      });

    case 'anthropic':
      return new ChatAnthropic({
        model,
        apiKey: provider.apiKey,
        temperature,
        maxTokens,
      });

    case 'ollama':
      return new ChatOllama({
        model,
        baseUrl: env.OLLAMA_BASE_URL,
        temperature,
      });
  }
};

/** Human-readable model label recorded on each agent run. */
export const describeModel = (provider: ResolvedProvider): string =>
  provider.model?.trim() || DEFAULT_MODELS[provider.providerId];
