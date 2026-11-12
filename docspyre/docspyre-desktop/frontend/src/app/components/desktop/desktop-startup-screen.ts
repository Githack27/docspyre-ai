import { Component, computed, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import type { BackendStartupStep, BackendStatus } from '../../core/desktop/desktop';

interface ServiceMeta {
  title: string;
  subtitle: string;
  port?: string;
  iconType: string;
}

const SERVICE_CATALOG: Record<string, ServiceMeta> = {
  'software-update': {
    title: 'Software Update',
    subtitle: 'Signed releases from the DETQEL License Portal',
    iconType: 'update',
  },
  docker: {
    title: 'Docker Daemon',
    subtitle: 'Container Runtime Virtualization',
    iconType: 'docker',
  },
  'application-database': {
    title: 'PostgreSQL Database',
    subtitle: 'Relational Workspace Storage',
    port: ':57001:5432',
    iconType: 'database',
  },
  milvus: {
    title: 'Milvus Vector Store',
    subtitle: 'Vector Embeddings & Search Index',
    port: ':57003:19530',
    iconType: 'vector',
  },
  ollama: {
    title: 'Ollama Embedding Engine',
    subtitle: 'Local Neural Embedding Model',
    port: ':57005:11434',
    iconType: 'ollama',
  },
  'litellm-database': {
    title: 'LiteLLM Database',
    subtitle: 'AI Proxy State & Configurations',
    port: ':5432 (Internal)',
    iconType: 'database-proxy',
  },
  litellm: {
    title: 'LiteLLM AI Gateway',
    subtitle: 'Multi-Model Inference Router',
    port: ':57004:4000',
    iconType: 'gateway',
  },
  'backend-startup': {
    title: 'DocSpyre Orchestrator',
    subtitle: 'Core Desktop Supervisor & Runtime',
    iconType: 'orchestrator',
  },
  'backend-api': {
    title: 'DocSpyre API Service',
    subtitle: 'Document Intelligence & Agents',
    port: ':57000:8000',
    iconType: 'api',
  },
  'frontend-startup': {
    title: 'Desktop Workspace UI',
    subtitle: 'Angular Desktop Shell',
    port: ':4200',
    iconType: 'frontend',
  },
};

@Component({
  selector: 'app-desktop-startup-screen',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './desktop-startup-screen.html',
  styleUrl: './desktop-startup-screen.css',
})
export class DesktopStartupScreen {
  readonly status = input<BackendStatus | null>(null);
  readonly runtimeError = input<string | null>(null);

  readonly error = computed(() => this.runtimeError() ?? this.status()?.error ?? null);
  readonly steps = computed(() => this.status()?.steps ?? []);
  readonly completedCount = computed(
    () => this.steps().filter((s) => s.status === 'complete').length,
  );
  readonly totalCount = computed(() => this.steps().length);
  readonly progressPercent = computed(() =>
    this.totalCount() > 0 ? Math.round((this.completedCount() / this.totalCount()) * 100) : 0,
  );
  readonly activeStep = computed(() => this.steps().find((s) => s.status === 'running'));

  readonly elapsedFormatted = computed(() => {
    const s = this.status()?.elapsedSeconds ?? 0;
    return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  });

  getMeta(step: BackendStartupStep): ServiceMeta {
    return (
      SERVICE_CATALOG[step.id] ?? {
        title: step.label,
        subtitle: step.detail || 'Platform Service',
        iconType: 'default',
      }
    );
  }

  statusLabel(status: string): string {
    switch (status) {
      case 'running':
        return 'Checking';
      case 'complete':
        return 'Ready';
      case 'error':
        return 'Failed';
      default:
        return 'Pending';
    }
  }
}

