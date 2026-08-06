import { prisma } from '../../db/prisma';
import { encrypt, decrypt } from '../../utils/encryption';

export interface CreateConfigInput {
  providerId: string;
  providerName: string;
  model: string;
  apiKey: string;
  systemPrompt?: string;
  active?: boolean;
}

export interface UpdateConfigInput {
  providerId?: string;
  providerName?: string;
  model?: string;
  apiKey?: string;
  systemPrompt?: string;
  active?: boolean;
}

export const configurationService = {
  /**
   * Retrieves all configurations for a user and decrypts keys & prompts.
   */
  async listConfigs(userId: string) {
    const configs = await prisma.providerConfig.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
    });

    return configs.map((config) => {
      let apiKey = '';
      let systemPrompt = '';

      try {
        apiKey = decrypt(config.encryptedKey);
      } catch (err) {
        console.error(`Failed to decrypt API Key for config ${config.id}:`, err);
      }

      if (config.encryptedPrompt) {
        try {
          systemPrompt = decrypt(config.encryptedPrompt);
        } catch (err) {
          console.error(`Failed to decrypt System Prompt for config ${config.id}:`, err);
        }
      }

      return {
        id: config.id,
        providerId: config.providerId,
        providerName: config.providerName,
        model: config.model,
        apiKey,
        systemPrompt: systemPrompt || undefined,
        active: config.active,
      };
    });
  },

  /**
   * Encrypts credentials and saves configuration to the database.
   */
  async createConfig(userId: string, input: CreateConfigInput) {
    const encryptedKey = encrypt(input.apiKey);
    const encryptedPrompt = input.systemPrompt ? encrypt(input.systemPrompt) : null;

    const config = await prisma.providerConfig.create({
      data: {
        userId,
        providerId: input.providerId,
        providerName: input.providerName,
        model: input.model,
        encryptedKey,
        encryptedPrompt,
        active: input.active ?? true,
      },
    });

    return {
      id: config.id,
      providerId: config.providerId,
      providerName: config.providerName,
      model: config.model,
      apiKey: input.apiKey,
      systemPrompt: input.systemPrompt,
      active: config.active,
    };
  },

  /**
   * Updates an existing configuration securely. Validates userId ownership.
   */
  async updateConfig(userId: string, id: string, input: UpdateConfigInput) {
    const existing = await prisma.providerConfig.findUnique({
      where: { id },
    });

    if (!existing || existing.userId !== userId) {
      throw new Error('Configuration not found or unauthorized');
    }

    const data: any = {};
    if (input.providerId) data.providerId = input.providerId;
    if (input.providerName) data.providerName = input.providerName;
    if (input.model) data.model = input.model;
    if (input.apiKey) data.encryptedKey = encrypt(input.apiKey);
    if (input.systemPrompt !== undefined) {
      data.encryptedPrompt = input.systemPrompt ? encrypt(input.systemPrompt) : null;
    }
    if (input.active !== undefined) data.active = input.active;

    const updated = await prisma.providerConfig.update({
      where: { id },
      data,
    });

    return {
      id: updated.id,
      providerId: updated.providerId,
      providerName: updated.providerName,
      model: updated.model,
      apiKey: input.apiKey || decrypt(updated.encryptedKey),
      systemPrompt: input.systemPrompt !== undefined ? input.systemPrompt : (updated.encryptedPrompt ? decrypt(updated.encryptedPrompt) : undefined),
      active: updated.active,
    };
  },

  /**
   * Deletes a configuration from the database securely. Validates userId ownership.
   */
  async deleteConfig(userId: string, id: string) {
    const existing = await prisma.providerConfig.findUnique({
      where: { id },
    });

    if (!existing || existing.userId !== userId) {
      throw new Error('Configuration not found or unauthorized');
    }

    await prisma.providerConfig.delete({
      where: { id },
    });
  },
};
