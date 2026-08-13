import { prisma } from '../../db/prisma';
import { decrypt } from '../../utils/encryption';

export interface ResolvedProvider {
  providerId: string;
  providerName: string;
  model: string;
  apiKey: string;
  systemPrompt?: string;
}

export const providerResolverService = {
  /**
   * Resolves the user's active AI provider configuration.
   * Reads from the ProviderConfig table (configured via the Settings UI).
   * Falls back to process.env.GEMINI_API_KEY if no config is found.
   */
  async resolve(userId: string): Promise<ResolvedProvider | null> {
    try {
      const config = await prisma.providerConfig.findFirst({
        where: { userId, active: true },
        orderBy: { updatedAt: 'desc' },
      });

      if (config) {
        const apiKey = decrypt(config.encryptedKey);
        const systemPrompt = config.encryptedPrompt ? decrypt(config.encryptedPrompt) : undefined;

        if (apiKey) {
          return {
            providerId: config.providerId,
            providerName: config.providerName,
            model: config.model,
            apiKey,
            systemPrompt,
          };
        }
      }
    } catch {
      // Fall through to env fallback
    }

    // Fallback: check if GEMINI_API_KEY is set in env
    const envKey = process.env.GEMINI_API_KEY;
    if (envKey) {
      return {
        providerId: 'gemini',
        providerName: 'Google Gemini',
        model: 'gemini-2.5-flash',
        apiKey: envKey,
      };
    }

    return null;
  },
};
