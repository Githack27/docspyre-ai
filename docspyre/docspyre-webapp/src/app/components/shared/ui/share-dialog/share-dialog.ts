import { Component, effect, inject, input, output, signal, untracked } from '@angular/core';
import { ShareService } from '../../../../core/shares/share.service';
import { ShareRecipient, ShareUser, SharePermission } from '../../../../core/shares/share.models';
import { WorkspaceService } from '../../../../core/workspace/workspace.service';
import { UserLite } from '../../../../core/workspace/workspace.models';

@Component({
  selector: 'app-share-dialog',
  imports: [],
  templateUrl: './share-dialog.html',
  styleUrl: './share-dialog.css',
})
export class ShareDialog {
  private readonly shares = inject(ShareService);
  private readonly workspace = inject(WorkspaceService);

  readonly documentId = input.required<string>();
  readonly name = input<string>('');
  readonly closed = output<void>();

  protected readonly query = signal('');
  protected readonly results = signal<UserLite[]>([]);
  protected readonly selected = signal<ShareUser[]>([]);
  protected readonly permission = signal<SharePermission>('VIEW');
  protected readonly recipients = signal<ShareRecipient[]>([]);
  protected readonly loading = signal(false);
  protected readonly searching = signal(false);
  protected readonly sharing = signal(false);
  protected readonly error = signal<string | null>(null);

  constructor() {
    effect(() => {
      const id = this.documentId();
      if (id) untracked(() => this.loadRecipients(id));
    });
  }

  private loadRecipients(id: string): void {
    this.loading.set(true);
    this.shares.recipients(id).subscribe({
      next: (r) => {
        this.recipients.set(r);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  protected onSearch(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.query.set(value);
    const term = value.trim();
    if (term.length < 2) {
      this.results.set([]);
      return;
    }
    this.searching.set(true);
    this.workspace.searchUsers(term).subscribe({
      next: (users) => {
        const taken = new Set([
          ...this.selected().map((s) => s.id),
          ...this.recipients().map((r) => r.id),
        ]);
        this.results.set(users.filter((u) => !taken.has(u.id)));
        this.searching.set(false);
      },
      error: () => this.searching.set(false),
    });
  }

  protected add(user: UserLite): void {
    const name = [user.firstName, user.lastName].filter(Boolean).join(' ').trim() || user.email;
    this.selected.update((list) => [...list, { id: user.id, email: user.email, name }]);
    this.query.set('');
    this.results.set([]);
  }

  protected removeSelected(id: string): void {
    this.selected.update((list) => list.filter((s) => s.id !== id));
  }

  protected setPermission(p: SharePermission): void {
    this.permission.set(p);
  }

  protected submit(): void {
    if (!this.selected().length || this.sharing()) return;
    this.sharing.set(true);
    this.error.set(null);
    this.shares.share(this.documentId(), this.selected().map((s) => s.id), this.permission()).subscribe({
      next: () => {
        this.selected.set([]);
        this.loadRecipients(this.documentId());
        this.sharing.set(false);
      },
      error: () => {
        this.error.set('Could not share. Please try again.');
        this.sharing.set(false);
      },
    });
  }

  protected revoke(userId: string): void {
    this.shares.revoke(this.documentId(), userId).subscribe({
      next: () => this.recipients.update((list) => list.filter((r) => r.id !== userId)),
      error: () => {},
    });
  }

  protected close(): void {
    this.closed.emit();
  }

  protected initials(name: string): string {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return name.slice(0, 2).toUpperCase();
  }
}
