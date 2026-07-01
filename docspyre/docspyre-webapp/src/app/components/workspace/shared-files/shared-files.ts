import { Component, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { ShareService } from '../../../core/shares/share.service';
import { IncomingShare, OutgoingShare } from '../../../core/shares/share.models';
import {
  DocumentItem,
  subtypeAccent,
  subtypeIcon,
  subtypeOf,
  viewerKind,
} from '../../../core/documents/document.models';
import { DocumentViewer } from '../../shared/ui/document-viewer/document-viewer';

@Component({
  selector: 'app-shared-files',
  imports: [DocumentViewer],
  templateUrl: './shared-files.html',
  styleUrl: './shared-files.css',
})
export class SharedFiles {
  private readonly shares = inject(ShareService);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  protected readonly tab = signal<'with' | 'by'>('with');
  protected readonly incoming = signal<IncomingShare[]>([]);
  protected readonly outgoing = signal<OutgoingShare[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly viewing = signal<DocumentItem | null>(null);

  protected readonly incomingCount = computed(() => this.incoming().length);
  protected readonly outgoingCount = computed(() => this.outgoing().length);

  constructor() {
    if (this.isBrowser) this.load();
  }

  protected load(): void {
    this.loading.set(true);
    this.error.set(null);
    let pending = 2;
    const done = () => { if (--pending === 0) this.loading.set(false); };

    this.shares.sharedWithMe().subscribe({
      next: (items) => { this.incoming.set(items); done(); },
      error: () => { this.error.set('Could not load shared files.'); done(); },
    });
    this.shares.sharedByMe().subscribe({
      next: (items) => { this.outgoing.set(items); done(); },
      error: () => { this.error.set('Could not load shared files.'); done(); },
    });
  }

  protected setTab(tab: 'with' | 'by'): void {
    this.tab.set(tab);
  }

  protected open(item: IncomingShare | OutgoingShare): void {
    if (!item.documentId) return;
    this.viewing.set({
      id: item.documentId,
      name: item.name,
      kind: viewerKind(item.name, item.mimeType),
      mimeType: item.mimeType,
      sizeBytes: item.sizeBytes,
      createdAt: item.sharedAt,
      updatedAt: item.sharedAt,
      deletedAt: null,
    });
  }

  protected closeViewer(): void {
    this.viewing.set(null);
  }

  protected revoke(share: OutgoingShare, userId: string): void {
    if (share.source !== 'DIRECT' || !share.documentId) return;
    this.shares.revoke(share.documentId, userId).subscribe({
      next: () => {
        this.outgoing.update((list) =>
          list
            .map((s) =>
              s.id === share.id ? { ...s, recipients: s.recipients.filter((r) => r.id !== userId) } : s,
            )
            .filter((s) => s.source !== 'DIRECT' || s.recipients.length > 0),
        );
      },
      error: () => {},
    });
  }

  protected iconFor(name: string, mime: string): string {
    return subtypeIcon(subtypeOf(name, mime));
  }

  protected accentFor(name: string, mime: string): string {
    return subtypeAccent(subtypeOf(name, mime));
  }

  protected initials(name: string): string {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return name.slice(0, 2).toUpperCase();
  }

  protected timeAgo(iso: string): string {
    const diff = Date.now() - new Date(iso).getTime();
    const day = 86_400_000;
    if (diff < 3_600_000) return `${Math.max(1, Math.floor(diff / 60_000))}m ago`;
    if (diff < day) return `${Math.floor(diff / 3_600_000)}h ago`;
    if (diff < 7 * day) return `${Math.floor(diff / day)}d ago`;
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  protected formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
}
