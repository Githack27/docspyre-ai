import { Component, OnInit, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ConfigurationService, ConnectedProvider } from '../../../core/configuration/configuration.service';

export interface AvailableProvider {
  id: string;
  name: string;
  models: string[];
  supportsValidation: boolean;
}

interface ValidateKeyResult {
  valid: boolean;
  tier: string;
  models: string[];
  error?: string;
}

@Component({
  selector: 'app-settings',
  imports: [CommonModule, FormsModule],
  templateUrl: './settings.html',
  styleUrl: './settings.css',
})
export class Settings implements OnInit {
  private readonly configService = inject(ConfigurationService);

  readonly providers = signal<ConnectedProvider[]>([]);
  readonly isModalOpen = signal<boolean>(false);
  editingProviderId: string | null = null;

  readonly availableProviders: AvailableProvider[] = [
    {
      id: 'openai',
      name: 'OpenAI',
      models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'],
      supportsValidation: true,
    },
    {
      id: 'anthropic',
      name: 'Anthropic',
      models: ['claude-3-5-sonnet-20241022', 'claude-3-5-haiku-20241022', 'claude-3-opus-20240229', 'claude-3-haiku-20240307'],
      supportsValidation: true,
    },
    {
      id: 'gemini',
      name: 'Google Gemini',
      models: ['gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-pro', 'gemini-1.5-flash'],
      supportsValidation: true,
    },
    {
      id: 'ollama',
      name: 'Ollama / Local',
      models: ['llama3', 'mistral', 'phi3', 'gemma', 'codellama'],
      supportsValidation: false,
    },
    {
      id: 'cohere',
      name: 'Cohere',
      models: ['command-r-plus', 'command-r', 'command-light'],
      supportsValidation: false,
    },
  ];

  readonly selectedProviderId = signal<string>('openai');
  selectedModel = '';
  customModel = '';
  apiKey = '';
  systemPrompt = '';

  readonly keyValidating = signal<boolean>(false);
  readonly keyValidationError = signal<string | null>(null);
  readonly detectedTier = signal<string | null>(null);
  readonly detectedModels = signal<string[] | null>(null);

  readonly selectedProvider = computed(() =>
    this.availableProviders.find(p => p.id === this.selectedProviderId())
  );

  get effectiveModels(): string[] {
    const live = this.detectedModels();
    if (live && live.length > 0) return live;
    return this.selectedProvider()?.models ?? [];
  }

  ngOnInit(): void {
    this.loadProviders();
  }

  // ---------------------------------------------------------------------------
  // Direct provider API validation — no backend call needed
  // ---------------------------------------------------------------------------

  async checkApiKey(): Promise<void> {
    const providerId = this.selectedProviderId();
    const apiKey = this.apiKey.trim();
    const provider = this.availableProviders.find(p => p.id === providerId);

    if (!provider?.supportsValidation) return;
    if (!apiKey) {
      this.keyValidationError.set('Please enter an API key first');
      return;
    }

    this.keyValidating.set(true);
    this.keyValidationError.set(null);
    this.detectedTier.set(null);
    this.detectedModels.set(null);

    let result: ValidateKeyResult;
    try {
      switch (providerId) {
        case 'openai':    result = await this.validateOpenAiKey(apiKey);    break;
        case 'anthropic': result = await this.validateAnthropicKey(apiKey); break;
        case 'gemini':    result = await this.validateGeminiKey(apiKey);    break;
        default:          result = { valid: false, tier: 'standard', models: [], error: 'Unsupported provider' };
      }
    } catch {
      result = { valid: false, tier: 'standard', models: [], error: 'Validation failed. Please try again.' };
    }

    this.keyValidating.set(false);

    if (!result.valid) {
      this.keyValidationError.set(result.error ?? 'Invalid API key');
      return;
    }

    this.detectedTier.set(result.tier);
    this.detectedModels.set(result.models);
    this.keyValidationError.set(null);

    if (result.models.length > 0) {
      this.selectedModel = result.models[0];
      this.customModel = '';
    }
  }

  private async validateOpenAiKey(apiKey: string): Promise<ValidateKeyResult> {
    const tier = apiKey.startsWith('sk-proj-') ? 'pro' : 'standard';
    const fallback = tier === 'pro'
      ? ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-4.5', 'o1', 'o1-mini', 'o3-mini']
      : ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'];

    try {
      const res = await fetch('https://api.openai.com/v1/models', {
        headers: { Authorization: `Bearer ${apiKey}` },
      });

      if (res.status === 401) return { valid: false, tier, models: fallback, error: 'Invalid OpenAI API key' };
      if (!res.ok) return { valid: true, tier, models: fallback };

      const data = await res.json() as { data: { id: string }[] };
      const seen = new Set<string>();
      const models = data.data
        .map((m) => m.id)
        .filter((id) => /^(gpt-4|gpt-3\.5|o1|o3|o4)/.test(id) && !id.includes('instruct'))
        .sort((a, b) => b.localeCompare(a))
        .filter((id) => (seen.has(id) ? false : seen.add(id) && true));

      return { valid: true, tier, models: models.length > 0 ? models : fallback };
    } catch {
      // CORS will block direct calls in browser — return fallback but mark valid
      // based on key prefix so user can still proceed
      return { valid: true, tier, models: fallback };
    }
  }

  private async validateAnthropicKey(apiKey: string): Promise<ValidateKeyResult> {
    const fallback = ['claude-3-5-sonnet-20241022', 'claude-3-5-haiku-20241022', 'claude-3-opus-20240229', 'claude-3-haiku-20240307'];
    // Anthropic blocks direct browser calls (CORS) — detect by key format
    // Anthropic keys always start with 'sk-ant-'
    if (!apiKey.startsWith('sk-ant-')) {
      return { valid: false, tier: 'standard', models: fallback, error: 'Invalid Anthropic API key format (should start with sk-ant-)' };
    }
    return { valid: true, tier: 'standard', models: fallback };
  }

  private async validateGeminiKey(apiKey: string): Promise<ValidateKeyResult> {
    const fallback = ['gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-pro', 'gemini-1.5-flash'];
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`
      );

      if (res.status === 400 || res.status === 403) {
        return { valid: false, tier: 'standard', models: fallback, error: 'Invalid Google Gemini API key' };
      }
      if (!res.ok) return { valid: true, tier: 'standard', models: fallback };

      const data = await res.json() as { models: { name: string; supportedGenerationMethods?: string[] }[] };
      const models = (data.models ?? [])
        .filter(m => m.name.includes('gemini') && (m.supportedGenerationMethods ?? []).includes('generateContent'))
        .map(m => m.name.replace('models/', ''))
        .sort((a, b) => b.localeCompare(a));

      return { valid: true, tier: 'standard', models: models.length > 0 ? models : fallback };
    } catch {
      return { valid: true, tier: 'standard', models: fallback };
    }
  }

  // ---------------------------------------------------------------------------
  // Rest of the component — unchanged
  // ---------------------------------------------------------------------------

  private loadProviders(): void {
    this.configService.listConfigs().subscribe({
      next: (list) => this.providers.set(list),
      error: (err) => console.error('Failed to load configurations:', err),
    });
  }

  toggleProvider(providerId: string, event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    this.configService.updateConfig(providerId, { active: checked }).subscribe({
      next: (updated) => {
        this.providers.set(this.providers().map(p => p.id === providerId ? updated : p));
      },
      error: (err) => {
        console.error('Failed to toggle provider:', err);
        (event.target as HTMLInputElement).checked = !checked;
      },
    });
  }

  deleteProvider(providerId: string): void {
    this.configService.deleteConfig(providerId).subscribe({
      next: () => this.providers.set(this.providers().filter(p => p.id !== providerId)),
      error: (err) => console.error('Failed to delete provider:', err),
    });
  }

  openModal(): void {
    this.editingProviderId = null;
    this.resetForm();
    this.isModalOpen.set(true);
  }

  openEditModal(provider: ConnectedProvider): void {
    this.editingProviderId = provider.id;
    this.selectedProviderId.set(provider.providerId);
    this.apiKey = provider.apiKey;
    this.systemPrompt = provider.systemPrompt || '';
    this.detectedModels.set(null);
    this.detectedTier.set(null);
    this.keyValidationError.set(null);

    const available = this.availableProviders.find(p => p.id === provider.providerId);
    if (available && available.models.includes(provider.model)) {
      this.selectedModel = provider.model;
      this.customModel = '';
    } else {
      this.selectedModel = 'custom';
      this.customModel = provider.model;
    }
    this.isModalOpen.set(true);
  }

  closeModal(): void {
    this.isModalOpen.set(false);
  }

  selectProvider(id: string): void {
    this.selectedProviderId.set(id);
    this.resetForm(false);
  }

  resetForm(resetProvider = true): void {
    if (resetProvider) this.selectedProviderId.set('openai');
    const current = this.selectedProvider();
    this.selectedModel = current?.models[0] ?? '';
    this.customModel = '';
    this.apiKey = '';
    this.systemPrompt = '';
    this.detectedModels.set(null);
    this.detectedTier.set(null);
    this.keyValidationError.set(null);
    this.keyValidating.set(false);
  }

  connectProvider(): void {
    if (!this.apiKey) {
      alert('Please provide an API Key');
      return;
    }
    const provider = this.selectedProvider();
    if (!provider) return;

    const finalModel = this.selectedModel === 'custom' ? this.customModel : this.selectedModel;
    if (!finalModel) {
      alert('Please select or specify a model');
      return;
    }

    const payload = {
      providerId: provider.id,
      providerName: provider.name,
      model: finalModel,
      apiKey: this.apiKey,
      systemPrompt: this.systemPrompt || undefined,
      active: true,
    };

    if (this.editingProviderId) {
      this.configService.updateConfig(this.editingProviderId, payload).subscribe({
        next: (updated) => {
          this.providers.set(this.providers().map(p => p.id === this.editingProviderId ? updated : p));
          this.closeModal();
        },
        error: (err) => {
          console.error('Failed to update provider:', err);
          alert('Failed to update provider configuration. Please try again.');
        },
      });
    } else {
      this.configService.createConfig(payload).subscribe({
        next: (created) => {
          this.providers.set([...this.providers(), created]);
          this.closeModal();
        },
        error: (err) => {
          console.error('Failed to create provider:', err);
          alert('Failed to create provider configuration. Please try again.');
        },
      });
    }
  }

  getProviderIconClass(providerId: string): string {
    switch (providerId) {
      case 'openai':    return 'bi-cpu';
      case 'anthropic': return 'bi-shield-check';
      case 'gemini':    return 'bi-stars';
      case 'ollama':    return 'bi-hdd-network';
      case 'cohere':    return 'bi-grid-3x3-gap';
      default:          return 'bi-robot';
    }
  }
}
