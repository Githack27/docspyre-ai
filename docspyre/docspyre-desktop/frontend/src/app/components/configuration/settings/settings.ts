import { Component, OnInit, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ConfigurationService, ConnectedProvider } from '../../../core/configuration/configuration.service';

export interface AvailableProvider {
  id: string;
  name: string;
  models: string[];
}

@Component({
  selector: 'app-settings',
  imports: [CommonModule, FormsModule],
  templateUrl: './settings.html',
  styleUrl: './settings.css',
})
export class Settings implements OnInit {
  private readonly configService = inject(ConfigurationService);

  // State for configured providers
  readonly providers = signal<ConnectedProvider[]>([]);

  // Modal display control
  readonly isModalOpen = signal<boolean>(false);
  editingProviderId: string | null = null;

  // Static list of available providers
  readonly availableProviders: AvailableProvider[] = [
    { id: 'openai', name: 'OpenAI', models: ['gpt-4o', 'gpt-4-turbo', 'gpt-3.5-turbo'] },
    { id: 'anthropic', name: 'Anthropic', models: ['claude-3-5-sonnet', 'claude-3-opus', 'claude-3-haiku'] },
    { id: 'gemini', name: 'Google Gemini', models: ['gemini-1.5-pro', 'gemini-1.5-flash'] },
    { id: 'ollama', name: 'Ollama / Local', models: ['llama3', 'mistral', 'phi3'] },
    { id: 'cohere', name: 'Cohere', models: ['command-r-plus', 'command-r'] },
  ];

  // Form State
  readonly selectedProviderId = signal<string>('openai');
  selectedModel = '';
  customModel = '';
  apiKey = '';
  systemPrompt = '';

  // Get selected provider details
  readonly selectedProvider = computed(() => {
    return this.availableProviders.find(p => p.id === this.selectedProviderId());
  });

  ngOnInit(): void {
    this.loadProviders();
  }

  // Load from backend via API HTTP client
  private loadProviders(): void {
    this.configService.listConfigs().subscribe({
      next: (list) => {
        this.providers.set(list);
      },
      error: (err) => {
        console.error('Failed to load configurations:', err);
      }
    });
  }

  // Toggle active state
  toggleProvider(providerId: string, event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    this.configService.updateConfig(providerId, { active: checked }).subscribe({
      next: (updated) => {
        const list = this.providers().map(p => p.id === providerId ? updated : p);
        this.providers.set(list);
      },
      error: (err) => {
        console.error('Failed to toggle provider:', err);
        // Revert UI toggle if failed
        (event.target as HTMLInputElement).checked = !checked;
      }
    });
  }

  // Delete provider
  deleteProvider(providerId: string): void {
    this.configService.deleteConfig(providerId).subscribe({
      next: () => {
        const list = this.providers().filter(p => p.id !== providerId);
        this.providers.set(list);
      },
      error: (err) => {
        console.error('Failed to delete provider:', err);
      }
    });
  }

  // Modal Controls
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

    // Check if the current model is a standard model for the provider
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
    this.resetForm(false); // keep provider id
  }

  resetForm(resetProvider = true): void {
    if (resetProvider) {
      this.selectedProviderId.set('openai');
    }
    const current = this.selectedProvider();
    this.selectedModel = current && current.models.length > 0 ? current.models[0] : '';
    this.customModel = '';
    this.apiKey = '';
    this.systemPrompt = '';
  }

  // Connect click handler
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
      // Edit Mode
      this.configService.updateConfig(this.editingProviderId, payload).subscribe({
        next: (updated) => {
          const list = this.providers().map(p => p.id === this.editingProviderId ? updated : p);
          this.providers.set(list);
          this.closeModal();
        },
        error: (err) => {
          console.error('Failed to update provider:', err);
          alert('Failed to update provider configuration. Please try again.');
        }
      });
    } else {
      // Add Mode
      this.configService.createConfig(payload).subscribe({
        next: (created) => {
          this.providers.set([...this.providers(), created]);
          this.closeModal();
        },
        error: (err) => {
          console.error('Failed to create provider:', err);
          alert('Failed to create provider configuration. Please try again.');
        }
      });
    }
  }

  // Provider Icon Helpers
  getProviderIconClass(providerId: string): string {
    switch (providerId) {
      case 'openai': return 'bi-cpu';
      case 'anthropic': return 'bi-shield-check';
      case 'gemini': return 'bi-stars';
      case 'ollama': return 'bi-hdd-network';
      case 'cohere': return 'bi-grid-3x3-gap';
      default: return 'bi-robot';
    }
  }
}
