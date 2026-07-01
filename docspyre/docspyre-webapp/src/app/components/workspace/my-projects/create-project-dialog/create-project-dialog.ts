import { HttpErrorResponse } from '@angular/common/http';
import {
  Component,
  EventEmitter,
  Output,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { debounceTime, distinctUntilChanged, switchMap } from 'rxjs';
import { AuthService } from '../../../../core/auth/auth.service';
import { WorkspaceService } from '../../../../core/workspace/workspace.service';
import { ProjectDetail, UserLite } from '../../../../core/workspace/workspace.models';


@Component({
  selector: 'app-create-project-dialog',
  imports: [ReactiveFormsModule],
  templateUrl: './create-project-dialog.html',
  styleUrl: './create-project-dialog.css',
})
export class CreateProjectDialog {
  private readonly workspace = inject(WorkspaceService);
  private readonly auth = inject(AuthService);

  @Output() readonly closed = new EventEmitter<void>();
  @Output() readonly created = new EventEmitter<ProjectDetail>();

  protected readonly name = new FormControl('', { nonNullable: true });
  protected readonly emailSearch = new FormControl('', { nonNullable: true });

  protected readonly results = signal<UserLite[]>([]);
  protected readonly searching = signal(false);
  protected readonly selected = signal<UserLite[]>([]);
  protected readonly submitting = signal(false);
  protected readonly error = signal<string | null>(null);

  
  private readonly nameValue = toSignal(this.name.valueChanges, {
    initialValue: this.name.value,
  });

  protected readonly canSubmit = computed(
    () => this.nameValue().trim().length > 0 && !this.submitting(),
  );

  private readonly selfEmail = this.auth.currentUser()?.email.toLowerCase() ?? '';

  constructor() {
    this.emailSearch.valueChanges
      .pipe(
        debounceTime(250),
        distinctUntilChanged(),
        switchMap((term) => {
          const query = term.trim();
          if (query.length < 2) {
            this.searching.set(false);
            return [];
          }
          this.searching.set(true);
          return this.workspace.searchUsers(query);
        }),
        takeUntilDestroyed(),
      )
      .subscribe({
        next: (users) => {
          this.searching.set(false);
          this.results.set(this.filterCandidates(users));
        },
        error: () => {
          this.searching.set(false);
          this.results.set([]);
        },
      });
  }

  
  private filterCandidates(users: UserLite[]): UserLite[] {
    const taken = new Set(this.selected().map((u) => u.id));
    return users.filter((u) => u.email.toLowerCase() !== this.selfEmail && !taken.has(u.id));
  }

  protected addMember(user: UserLite): void {
    this.selected.update((list) => [...list, user]);
    this.results.update((list) => list.filter((u) => u.id !== user.id));
    this.emailSearch.setValue('');
  }

  protected removeMember(id: string): void {
    this.selected.update((list) => list.filter((u) => u.id !== id));
  }

  protected displayName(user: UserLite): string {
    const full = [user.firstName, user.lastName].filter(Boolean).join(' ').trim();
    return full || user.email;
  }

  protected initials(user: UserLite): string {
    const full = [user.firstName, user.lastName].filter(Boolean).join(' ').trim();
    const source = full || user.email;
    return source.slice(0, 2).toUpperCase();
  }

  protected submit(): void {
    if (!this.canSubmit()) return;
    this.submitting.set(true);
    this.error.set(null);

    this.workspace
      .createProject({
        name: this.name.value.trim(),
        memberEmails: this.selected().map((u) => u.email),
      })
      .subscribe({
        next: (project) => {
          this.submitting.set(false);
          this.created.emit(project);
        },
        error: (err: unknown) => {
          this.submitting.set(false);
          this.error.set(this.extractError(err));
        },
      });
  }

  protected close(): void {
    this.closed.emit();
  }

  private extractError(err: unknown): string {
    if (err instanceof HttpErrorResponse) {
      const body = err.error as { error?: { message?: string } } | null;
      if (body?.error?.message) return body.error.message;
    }
    return 'Could not create the project. Please try again.';
  }
}
