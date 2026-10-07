import { db, eq, and, providerConfigs } from '@docspyre/database';
import { encrypt, decrypt } from '../../core/utils/encryption';
import { ApiError } from '../../core/utils/api-error';
import { requireRow } from '../../core/utils/rows';

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

export interface ValidateKeyResult {
  valid: boolean;
  tier: string; // 'pro' | 'standard'
  models: string[];
  error?: string;
}

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

// ---------------------------------------------------------------------------
// Static fallback model lists
// ---------------------------------------------------------------------------

const OPENAI_STANDARD_MODELS = ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'];
const OPENAI_PRO_MODELS = ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-4.5', 'o1', 'o1-mini', 'o3-mini'];

const ANTHROPIC_MODELS = [
  'claude-opus-4-5',
  'claude-sonnet-4-5',
  'claude-3-5-sonnet-20241022',
  'claude-3-5-haiku-20241022',
  'claude-3-opus-20240229',
  'claude-3-haiku-20240307',
];

const GEMINI_MODELS = [
  'gemini-2.5-pro',
  'gemini-2.5-flash',
  'gemini-2.0-flash',
  'gemini-1.5-pro',
  'gemini-1.5-flash',
];

// ---------------------------------------------------------------------------
// Key validation helpers (OpenAI, Anthropic, Gemini only)
// ---------------------------------------------------------------------------

async function validateOpenAiKey(apiKey: string): Promise<ValidateKeyResult> {
  const tier = apiKey.startsWith('sk-proj-') ? 'pro' : 'standard';
  const fallback = tier === 'pro' ? OPENAI_PRO_MODELS : OPENAI_STANDARD_MODELS;

  try {
    const res = await fetch('https://api.openai.com/v1/models', {
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    if (res.status === 401) {
      return { valid: false, tier, models: fallback, error: 'Invalid OpenAI API key' };
    }
    if (!res.ok) {
      return { valid: true, tier, models: fallback };
    }

    const data = (await res.json()) as { data: { id: string }[] };
    const seen = new Set<string>();
    const models = data.data
      .map((m) => m.id)
      .filter((id) => /^(gpt-4|gpt-3\.5|o1|o3|o4)/.test(id) && !id.includes('instruct'))
      .sort((a, b) => b.localeCompare(a))
      .filter((id) => (seen.has(id) ? false : seen.add(id) && true));

    return { valid: true, tier, models: models.length > 0 ? models : fallback };
  } catch {
    return { valid: true, tier, models: fallback };
  }
}

async function validateAnthropicKey(apiKey: string): Promise<ValidateKeyResult> {
  try {
    const res = await fetch('https://api.anthropic.com/v1/models', {
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    });

    if (res.status === 401 || res.status === 403) {
      return { valid: false, tier: 'standard', models: ANTHROPIC_MODELS, error: 'Invalid Anthropic API key' };
    }
    if (!res.ok) return { valid: true, tier: 'standard', models: ANTHROPIC_MODELS };

    const data = (await res.json()) as { data: { id: string }[] };
    const models = data.data.map((m) => m.id).sort((a, b) => b.localeCompare(a));

    return { valid: true, tier: 'standard', models: models.length > 0 ? models : ANTHROPIC_MODELS };
  } catch {
    return { valid: true, tier: 'standard', models: ANTHROPIC_MODELS };
  }
}

async function validateGeminiKey(apiKey: string): Promise<ValidateKeyResult> {
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`,
    );

    if (res.status === 400 || res.status === 403) {
      return { valid: false, tier: 'standard', models: GEMINI_MODELS, error: 'Invalid Google Gemini API key' };
    }
    if (!res.ok) return { valid: true, tier: 'standard', models: GEMINI_MODELS };

    const data = (await res.json()) as {
      models: { name: string; supportedGenerationMethods?: string[] }[];
    };

    const models = (data.models ?? [])
      .filter(
        (m) =>
          m.name.includes('gemini') &&
          (m.supportedGenerationMethods ?? []).includes('generateContent'),
      )
      .map((m) => m.name.replace('models/', ''))
      .sort((a, b) => b.localeCompare(a));

    return { valid: true, tier: 'standard', models: models.length > 0 ? models : GEMINI_MODELS };
  } catch {
    return { valid: true, tier: 'standard', models: GEMINI_MODELS };
  }
}

// ---------------------------------------------------------------------------
// DB helpers
// ---------------------------------------------------------------------------

const safeDecrypt = (ciphertext: string): string | null => {
  try {
    return decrypt(ciphertext);
  } catch {
    return null;
  }
};

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

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

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
    if (input.systemPrompt !== undefined)
      updates.encryptedPrompt = input.systemPrompt ? encrypt(input.systemPrompt) : null;
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

  async validateKey(providerId: string, apiKey: string): Promise<ValidateKeyResult> {
    switch (providerId) {
      case 'openai':    return validateOpenAiKey(apiKey);
      case 'anthropic': return validateAnthropicKey(apiKey);
      case 'gemini':    return validateGeminiKey(apiKey);
      default:
        throw ApiError.badRequest(`Key validation is not supported for provider: ${providerId}`);
    }
  },
};
