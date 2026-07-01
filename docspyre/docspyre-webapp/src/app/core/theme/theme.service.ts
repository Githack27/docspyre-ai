import { DOCUMENT, Injectable, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { PLATFORM_ID } from '@angular/core';

export type ThemeMode = 'light' | 'dark';

const STORAGE_KEY = 'docspyre-theme';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly document = inject(DOCUMENT);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly isBrowser = isPlatformBrowser(this.platformId);

  readonly mode = signal<ThemeMode>('light');

  constructor() {
    this.mode.set(this.resolveInitialMode());
    this.apply(this.mode());
  }

  toggle(): void {
    this.setMode(this.mode() === 'light' ? 'dark' : 'light');
  }

  setMode(mode: ThemeMode): void {
    this.mode.set(mode);
    this.apply(mode);
    if (this.isBrowser) {
      localStorage.setItem(STORAGE_KEY, mode);
    }
  }

  private resolveInitialMode(): ThemeMode {
    if (!this.isBrowser) {
      return 'light';
    }
    const stored = localStorage.getItem(STORAGE_KEY) as ThemeMode | null;
    if (stored === 'light' || stored === 'dark') {
      return stored;
    }
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  private apply(mode: ThemeMode): void {
    const root = this.document.documentElement;
    root.classList.toggle('dark', mode === 'dark');
  }
}
