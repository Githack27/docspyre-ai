import { Component, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Router } from '@angular/router';
import { WorkspaceService } from '../../../core/workspace/workspace.service';
import { ProjectSummary } from '../../../core/workspace/workspace.models';
import { AuthService } from '../../../core/auth/auth.service';
import { userInitials } from '../../../core/auth/user-display';
import { ProjectCard } from '../../shared/ui/project-card/project-card';

const ACCENTS = ['violet', 'orange', 'pink', 'blue', 'green'] as const;

@Component({
  selector: 'app-recent-projects',
  imports: [ProjectCard],
  templateUrl: './recent-projects.html',
  styleUrl: './recent-projects.css',
})
export class RecentProjects {
  private readonly workspace = inject(WorkspaceService);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);

  private readonly all = signal<ProjectSummary[]>([]);

  protected readonly projects = computed(() =>
    [...this.all()].sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    ),
  );

  protected readonly userInitials = computed(() => userInitials(this.auth.currentUser()));

  constructor() {
    if (this.isBrowser) {
      this.load();
    }
  }

  protected load(): void {
    this.loading.set(true);
    this.error.set(null);
    this.workspace.listProjects().subscribe({
      next: (projects) => {
        this.all.set(projects);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('Could not load your recent projects.');
        this.loading.set(false);
      },
    });
  }

  protected openProject(id: string): void {
    this.router.navigate(['/app/workspace/my-projects', id]);
  }

  protected accentFor(index: number): string {
    return ACCENTS[index % ACCENTS.length];
  }

  protected lastAccessed(iso: string): string {
    const then = new Date(iso).getTime();
    if (Number.isNaN(then)) return '';
    const diff = Date.now() - then;
    const minute = 60_000;
    const hour = 60 * minute;
    const day = 24 * hour;

    if (diff < minute) return 'Just now';
    if (diff < hour) return `${Math.floor(diff / minute)}m ago`;
    if (diff < day) return `${Math.floor(diff / hour)}h ago`;
    if (diff < 7 * day) return `${Math.floor(diff / day)}d ago`;
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }
}
