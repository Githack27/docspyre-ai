import { db, eq, and, desc, providerConfigs } from '@docspyre/database';
import { decrypt } from '../../../core/utils/encryption';
import { env } from '../../../core/config';
import { logger } from '../../../core/utils/logger';

export type ProviderId = 'gemini' | 'openai' | 'anthropic' | 'cohere' | 'ollama';

export interface ResolvedProvider {
  providerId: ProviderId;
  model: string;
  apiKey: string;
  /** Operator-supplied persona, prepended to the agent's own rules. */
  systemPrompt: string | null;
  /** Workspace-specific tone/persona guidance. */
  workspacePersona?: string | null;
  /** True when this came from env fallback rather than a user config. */
  isFallback: boolean;
}

const SUPPORTED: ReadonlySet<string> = new Set<ProviderId>([
  'gemini',
  'openai',
  'anthropic',
  'cohere',
  'ollama',
]);

const isSupported = (id: string): id is ProviderId => SUPPORTED.has(id);

/** Attempts decryption; returns null on failure so a bad row doesn't crash the turn. */
const safeDecrypt = (ciphertext: string): string | null => {
  try {
    return decrypt(ciphertext);
  } catch (error) {
    logger.warn('Failed to decrypt provider config (key may have rotated)', {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
};

export const providerResolverService = {
  async resolve(userId: string, workspaceId?: string | null): Promise<ResolvedProvider | null> {
    const [config] = await db
      .select()
      .from(providerConfigs)
      .where(and(eq(providerConfigs.userId, userId), eq(providerConfigs.active, true)))
      .orderBy(desc(providerConfigs.updatedAt))
      .limit(1);

    if (config && isSupported(config.providerId)) {
      const apiKey = safeDecrypt(config.encryptedKey);

      // If decryption fails, skip this config and fall through to env/ollama.
      if (apiKey) {
        return {
          providerId: config.providerId,
          model: config.model,
          apiKey,
          systemPrompt: config.encryptedPrompt ? safeDecrypt(config.encryptedPrompt) : null,
          isFallback: false,
        };
      }
    }

    if (env.GEMINI_API_KEY) {
      return {
        providerId: 'gemini',
        model: 'gemini-3.6-flash',
        apiKey: env.GEMINI_API_KEY,
        systemPrompt: null,
        isFallback: true,
      };
    }

    return {
      providerId: 'ollama',
      model: 'llama3.2',
      apiKey: '',
      systemPrompt: null,
      isFallback: true,
    };
  },
};
