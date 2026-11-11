import { Component, OnDestroy, OnInit, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet } from '@angular/router';
import { ConfirmationModal } from './components/shared/ui/confirmation-modal/confirmation-modal';
import { DesktopStartupScreen } from './components/desktop/desktop-startup-screen';
import {
  backendStatus,
  inDesktop,
  initializeDesktopTransport,
  notifyFrontendReady,
  type BackendStatus,
} from './core/desktop/desktop';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, RouterOutlet, ConfirmationModal, DesktopStartupScreen],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App implements OnInit, OnDestroy {
  protected readonly title = signal('Docspyre');
  protected readonly isDesktop = signal(inDesktop());
  protected readonly status = signal<BackendStatus | null>(null);
  protected readonly runtimeError = signal<string | null>(null);

  protected readonly isReady = computed(() => {
    if (!this.isDesktop()) return true;
    const current = this.status();
    return Boolean(current?.ready && !current.error && !this.runtimeError());
  });

  private pollTimer: any = null;
  private destroyed = false;

  ngOnInit(): void {
    if (this.isDesktop()) {
      initializeDesktopTransport();
      this.notifyReady();
      this.pollBackendStatus();
    }
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
    }
  }

  private notifyReady(): void {
    notifyFrontendReady().catch((err) => {
      console.error('Failed to notify desktop supervisor:', err);
    });
  }

  private async pollBackendStatus(): Promise<void> {
    if (this.destroyed) return;
    try {
      this.notifyReady();
      const current = await backendStatus();
      if (!this.destroyed) {
        this.status.set(current);
        this.runtimeError.set(null);
      }
    } catch (err) {
      if (!this.destroyed) {
        this.runtimeError.set(
          err instanceof Error ? err.message : 'Unable to connect to desktop supervisor.',
        );
      }
    } finally {
      if (!this.destroyed) {
        this.pollTimer = setTimeout(() => this.pollBackendStatus(), 800);
      }
    }
  }
}
