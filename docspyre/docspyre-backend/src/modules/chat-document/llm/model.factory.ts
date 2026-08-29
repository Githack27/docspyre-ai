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
  gemini: 'gemini-2.5-flash',
  openai: 'gpt-4o-mini',
  anthropic: 'claude-3-5-sonnet-20241022',
  cohere: 'command-r-plus',
  ollama: 'llama3.2',
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
