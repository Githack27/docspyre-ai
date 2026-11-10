import { db, eq, and, providerConfigs } from '@docspyre/database';
import { encrypt, decrypt } from '../../core/utils/encryption';
import { ApiError } from '../../core/utils/api-error';
import { requireRow } from '../../core/utils/rows';

/** Returns null on failure so corrupted rows don't crash listing. */
const safeDecrypt = (ciphertext: string): string | null => {
  try {
    return decrypt(ciphertext);
  } catch {
    return null;
  }
};

interface PublicProviderConfig {
  id: string;
  providerId: string;
  providerName: string;
  model: string;
  active: boolean;
  systemPrompt: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface CreateConfigInput {
  providerId: string;
  providerName: string;
  model: string;
  apiKey: string;
  systemPrompt?: string;
}

interface UpdateConfigInput {
  model?: string;
  apiKey?: string;
  systemPrompt?: string;
  active?: boolean;
}

const toPublic = (row: typeof providerConfigs.$inferSelect): PublicProviderConfig => ({
  id: row.id,
  providerId: row.providerId,
  providerName: row.providerName,
  model: row.model,
  active: row.active,
  systemPrompt: row.encryptedPrompt ? safeDecrypt(row.encryptedPrompt) : null,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

export const configurationService = {
  async listConfigs(userId: string): Promise<PublicProviderConfig[]> {
    const rows = await db.select().from(providerConfigs).where(eq(providerConfigs.userId, userId));
    return rows.map(toPublic);
  },

  async createConfig(userId: string, input: CreateConfigInput): Promise<PublicProviderConfig> {
    const row = requireRow(
      await db
        .insert(providerConfigs)
        .values({
          userId,
          providerId: input.providerId,
          providerName: input.providerName,
          model: input.model,
          encryptedKey: encrypt(input.apiKey),
          encryptedPrompt: input.systemPrompt ? encrypt(input.systemPrompt) : null,
        })
        .returning(),
      'provider config insert',
    );
    return toPublic(row);
  },

  async updateConfig(userId: string, id: string, input: UpdateConfigInput): Promise<PublicProviderConfig> {
    const [existing] = await db
      .select()
      .from(providerConfigs)
      .where(and(eq(providerConfigs.id, id), eq(providerConfigs.userId, userId)))
      .limit(1);
    if (!existing) throw ApiError.notFound('Configuration not found');

    const updates: Record<string, unknown> = {};
    if (input.model !== undefined) updates.model = input.model;
    if (input.apiKey !== undefined) updates.encryptedKey = encrypt(input.apiKey);
    if (input.systemPrompt !== undefined) updates.encryptedPrompt = input.systemPrompt ? encrypt(input.systemPrompt) : null;
    if (input.active !== undefined) updates.active = input.active;

    const row = requireRow(
      await db
        .update(providerConfigs)
        .set(updates)
        .where(eq(providerConfigs.id, id))
        .returning(),
      'provider config update',
    );
    return toPublic(row);
  },

  async deleteConfig(userId: string, id: string): Promise<void> {
    const [existing] = await db
      .select()
      .from(providerConfigs)
      .where(and(eq(providerConfigs.id, id), eq(providerConfigs.userId, userId)))
      .limit(1);
    if (!existing) throw ApiError.notFound('Configuration not found');
    await db.delete(providerConfigs).where(eq(providerConfigs.id, id));
  },
};
