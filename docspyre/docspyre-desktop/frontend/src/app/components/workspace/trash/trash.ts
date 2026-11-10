import { Component, PLATFORM_ID, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { DocumentService } from '../../../core/documents/document.service';
import { DocumentItem, DocumentKind } from '../../../core/documents/document.models';

const RETENTION_DAYS = 30;

@Component({
  selector: 'app-trash',
  imports: [],
  templateUrl: './trash.html',
  styleUrl: './trash.css',
})
export class Trash {
  private readonly documents = inject(DocumentService);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  protected readonly items = signal<DocumentItem[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly busyId = signal<string | null>(null);

  constructor() {
    if (this.isBrowser) this.load();
  }

  protected load(): void {
    this.loading.set(true);
    this.error.set(null);
    this.documents.listTrash().subscribe({
      next: (docs) => {
        this.items.set(docs);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('Could not load Trash.');
        this.loading.set(false);
      },
    });
  }

  protected restore(id: string): void {
    if (this.busyId()) return;
    this.busyId.set(id);
    this.documents.restore(id).subscribe({
      next: () => {
        this.items.update((list) => list.filter((d) => d.id !== id));
        this.busyId.set(null);
      },
      error: () => this.busyId.set(null),
    });
  }

  protected purge(id: string): void {
    if (this.busyId()) return;
    this.busyId.set(id);
    this.documents.purge(id).subscribe({
      next: () => {
        this.items.update((list) => list.filter((d) => d.id !== id));
        this.busyId.set(null);
      },
      error: () => this.busyId.set(null),
    });
  }

  protected daysLeft(deletedAt: string | null): number {
    if (!deletedAt) return RETENTION_DAYS;
    const elapsed = (Date.now() - new Date(deletedAt).getTime()) / (1000 * 60 * 60 * 24);
    return Math.max(0, Math.ceil(RETENTION_DAYS - elapsed));
  }

  protected iconFor(kind: DocumentKind): string {
    switch (kind) {
      case 'IMAGE': return 'bi-image';
      case 'VIDEO': return 'bi-camera-video-fill';
      case 'AUDIO': return 'bi-music-note-beamed';
      case 'PDF': return 'bi-file-earmark-pdf-fill';
      case 'DOCUMENT': return 'bi-file-earmark-text-fill';
      default: return 'bi-file-earmark-fill';
    }
  }

  protected accentFor(kind: DocumentKind): string {
    switch (kind) {
      case 'IMAGE': return 'blue';
      case 'VIDEO': return 'pink';
      case 'AUDIO': return 'green';
      case 'PDF': return 'orange';
      default: return 'violet';
    }
  }

  protected formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
}
