import { Component, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { RouterLink } from '@angular/router';
import { DocumentService } from '../../../core/documents/document.service';
import {
  DOCUMENT_FILTERS,
  DocSubtype,
  DocumentItem,
  subtypeOf,
  viewerKind,
} from '../../../core/documents/document.models';
import { DocumentViewer } from '../../shared/ui/document-viewer/document-viewer';
import { ShareDialog } from '../../shared/ui/share-dialog/share-dialog';
import { DocumentCard } from '../../shared/ui/document-card/document-card';

@Component({
  selector: 'app-my-documents',
  imports: [RouterLink, DocumentViewer, ShareDialog, DocumentCard],
  templateUrl: './my-documents.html',
  styleUrl: './my-documents.css',
})
export class MyDocuments {
  private readonly documents = inject(DocumentService);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  protected readonly filters = DOCUMENT_FILTERS;
  protected readonly activeFilter = signal<'ALL' | DocSubtype>('ALL');

  protected readonly all = signal<DocumentItem[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly uploading = signal(false);
  protected readonly dragging = signal(false);

  protected readonly viewing = signal<DocumentItem | null>(null);
  protected readonly sharing = signal<DocumentItem | null>(null);
  protected readonly deletingId = signal<string | null>(null);

  private readonly thumbs = signal<Record<string, string>>({});

  protected readonly filtered = computed(() => {
    const f = this.activeFilter();
    const list = this.all();
    return f === 'ALL' ? list : list.filter((d) => subtypeOf(d.name, d.mimeType) === f);
  });

  protected readonly total = computed(() => this.all().length);

  constructor() {
    if (this.isBrowser) this.load();
  }

  protected load(): void {
    this.loading.set(true);
    this.error.set(null);
    this.documents.list().subscribe({
      next: (docs) => {
        this.all.set(docs);
        this.loading.set(false);
        this.loadThumbnails(docs);
      },
      error: () => {
        this.error.set('Could not load your documents.');
        this.loading.set(false);
      },
    });
  }

  protected countFor(id: 'ALL' | DocSubtype): number {
    const list = this.all();
    return id === 'ALL' ? list.length : list.filter((d) => subtypeOf(d.name, d.mimeType) === id).length;
  }

  protected setFilter(id: 'ALL' | DocSubtype): void {
    this.activeFilter.set(id);
  }

  // --- upload ----------------------------------------------------------------
  protected onFilesPicked(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.upload(Array.from(input.files ?? []));
    input.value = '';
  }

  protected onDrop(event: DragEvent): void {
    event.preventDefault();
    this.dragging.set(false);
    this.upload(Array.from(event.dataTransfer?.files ?? []));
  }

  protected onDragOver(event: DragEvent): void {
    event.preventDefault();
    this.dragging.set(true);
  }

  protected onDragLeave(): void {
    this.dragging.set(false);
  }

  private upload(files: File[]): void {
    if (!files.length) return;
    this.uploading.set(true);
    this.documents.upload(files).subscribe({
      next: (created) => {
        this.all.update((list) => [...created, ...list]);
        this.uploading.set(false);
        this.loadThumbnails(created);
      },
      error: () => {
        this.error.set('Upload failed. Check the file size and try again.');
        this.uploading.set(false);
      },
    });
  }

  // --- viewing / deleting ----------------------------------------------------
  protected open(doc: DocumentItem): void {
    // Pass a kind resolved from the extension so previews (esp. PDF) are correct.
    this.viewing.set({ ...doc, kind: viewerKind(doc.name, doc.mimeType) });
  }

  protected closeViewer(): void {
    this.viewing.set(null);
  }

  protected openShare(doc: DocumentItem): void {
    this.sharing.set(doc);
  }

  protected closeShare(): void {
    this.sharing.set(null);
  }

  protected remove(id: string): void {
    if (this.deletingId()) return;
    this.deletingId.set(id);
    this.documents.remove(id).subscribe({
      next: () => {
        this.all.update((list) => list.filter((d) => d.id !== id));
        this.releaseThumb(id);
        if (this.viewing()?.id === id) this.viewing.set(null);
        this.deletingId.set(null);
      },
      error: () => this.deletingId.set(null),
    });
  }

  // --- thumbnails ------------------------------------------------------------
  private loadThumbnails(docs: DocumentItem[]): void {
    if (!this.isBrowser) return;
    for (const doc of docs) {
      if (subtypeOf(doc.name, doc.mimeType) !== 'IMAGE' || this.thumbs()[doc.id]) continue;
      this.documents.fetchBlob(doc.id).subscribe({
        next: (blob) => {
          const url = URL.createObjectURL(blob);
          this.thumbs.update((map) => ({ ...map, [doc.id]: url }));
        },
        error: () => {},
      });
    }
  }

  private releaseThumb(id: string): void {
    const url = this.thumbs()[id];
    if (url) {
      URL.revokeObjectURL(url);
      this.thumbs.update((map) => {
        const next = { ...map };
        delete next[id];
        return next;
      });
    }
  }

  protected thumb(id: string): string | null {
    return this.thumbs()[id] ?? null;
  }
}
