import { GoogleGenerativeAIEmbeddings } from '@langchain/google-genai';
import { OpenAIEmbeddings } from '@langchain/openai';
import { OllamaEmbeddings } from '@langchain/ollama';
import { env } from '../../../core/config';
import { logger } from '../../../core/utils/logger';
import type { ResolvedProvider } from '../llm/provider-resolver.service';

/**
 * Stable identifiers persisted alongside each chunk vector. Dense similarity is
 * only meaningful within one id, so the retriever compares this before scoring.
 */
export const EMBEDDING_MODELS = {
  google: { id: 'google:gemini-embedding-001', dim: 3072 },
  openai: { id: 'openai:text-embedding-3-small', dim: 1536 },
  ollama: { id: 'ollama:nomic-embed-text', dim: 768 },
  local: { id: 'local:hash-768', dim: 768 },
} as const;

export type EmbeddingModelId = (typeof EMBEDDING_MODELS)[keyof typeof EMBEDDING_MODELS]['id'];

export interface EmbeddingModel {
  id: EmbeddingModelId;
  dim: number;
  embed(texts: string[]): Promise<number[][]>;
  embedOne(text: string): Promise<number[]>;
}

/**
 * Deterministic bag-of-characters projection. Not semantic, but it keeps the
 * pipeline functional with zero external dependencies and stays consistent
 * between index and query time, so lexical+dense fusion still ranks sensibly.
 */
const hashEmbed = (text: string, dims = EMBEDDING_MODELS.local.dim): number[] => {
  const vector = new Array<number>(dims).fill(0);
  const tokens = text.toLowerCase().split(/\W+/).filter(Boolean);

  tokens.forEach((token, tokenIndex) => {
    for (let i = 0; i < token.length; i += 1) {
      const slot = (token.charCodeAt(i) * (tokenIndex + 1) * (i + 1)) % dims;
      vector[slot] = (vector[slot] ?? 0) + 1;
    }
  });

  const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0)) || 1;
  return vector.map((value) => value / magnitude);
};

const localModel: EmbeddingModel = {
  id: EMBEDDING_MODELS.local.id,
  dim: EMBEDDING_MODELS.local.dim,
  async embed(texts) {
    return texts.map((text) => hashEmbed(text));
  },
  async embedOne(text) {
    return hashEmbed(text);
  },
};

/** Wraps a LangChain embeddings instance, falling back to the local model. */
const wrap = (
  id: EmbeddingModelId,
  dim: number,
  client: { embedDocuments(texts: string[]): Promise<number[][]>; embedQuery(text: string): Promise<number[]> },
): EmbeddingModel => ({
  id,
  dim,
  async embed(texts) {
    return client.embedDocuments(texts);
  },
  async embedOne(text) {
    return client.embedQuery(text);
  },
});

const buildOllama = (): EmbeddingModel =>
  wrap(
    EMBEDDING_MODELS.ollama.id,
    EMBEDDING_MODELS.ollama.dim,
    new OllamaEmbeddings({ model: 'nomic-embed-text', baseUrl: env.OLLAMA_BASE_URL }),
  );

/** Candidate order for a provider: native embeddings, then Ollama, then local. */
const candidatesFor = (provider: ResolvedProvider | null): EmbeddingModel[] => {
  const chain: EmbeddingModel[] = [];

  if (provider?.providerId === 'gemini' && provider.apiKey) {
    chain.push(
      wrap(
        EMBEDDING_MODELS.google.id,
        EMBEDDING_MODELS.google.dim,
        new GoogleGenerativeAIEmbeddings({ model: 'gemini-embedding-001', apiKey: provider.apiKey }),
      ),
    );
  }

  if ((provider?.providerId === 'openai' || provider?.providerId === 'cohere') && provider.apiKey) {
    chain.push(
      wrap(
        EMBEDDING_MODELS.openai.id,
        EMBEDDING_MODELS.openai.dim,
        new OpenAIEmbeddings({ model: 'text-embedding-3-small', apiKey: provider.apiKey }),
      ),
    );
  }

  if (env.GEMINI_API_KEY && !chain.length) {
    chain.push(
      wrap(
        EMBEDDING_MODELS.google.id,
        EMBEDDING_MODELS.google.dim,
        new GoogleGenerativeAIEmbeddings({ model: 'gemini-embedding-001', apiKey: env.GEMINI_API_KEY }),
      ),
    );
  }

  chain.push(buildOllama(), localModel);
  return chain;
};

/** Probes a model with a trivial input so failures surface before bulk work. */
const probe = async (model: EmbeddingModel): Promise<boolean> => {
  try {
    const [vector] = await model.embed(['ping']);
    return Array.isArray(vector) && vector.length > 0;
  } catch {
    return false;
  }
};

export const embeddingService = {
  localModel,

  /** First working embedding model for a provider. Never throws. */
  async resolve(provider: ResolvedProvider | null): Promise<EmbeddingModel> {
    for (const candidate of candidatesFor(provider)) {
      if (candidate.id === localModel.id) break;
      if (await probe(candidate)) return candidate;
      logger.debug('Embedding model unavailable, trying next', { model: candidate.id });
    }
    return localModel;
  },

  /**
   * Rebuilds a specific model by id so query vectors match stored chunk
   * vectors. Returns null when that model can no longer be reached.
   */
  async byId(id: string, provider: ResolvedProvider | null): Promise<EmbeddingModel | null> {
    if (id === localModel.id) return localModel;

    const candidate = candidatesFor(provider).find((model) => model.id === id);
    if (!candidate) return null;
    return (await probe(candidate)) ? candidate : null;
  },
};
