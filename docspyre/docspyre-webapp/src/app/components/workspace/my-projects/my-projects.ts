import { Component, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Router } from '@angular/router';
import { WorkspaceService } from '../../../core/workspace/workspace.service';
import { ProjectDetail, ProjectSummary } from '../../../core/workspace/workspace.models';
import { AuthService } from '../../../core/auth/auth.service';
import { userInitials } from '../../../core/auth/user-display';
import { CreateProjectDialog } from './create-project-dialog/create-project-dialog';
import { ProjectCard } from '../../shared/ui/project-card/project-card';


const ACCENTS = ['violet', 'orange', 'pink', 'blue', 'green'] as const;

@Component({
  selector: 'app-my-projects',
  imports: [CreateProjectDialog, ProjectCard],
  templateUrl: './my-projects.html',
  styleUrl: './my-projects.css',
})
export class MyProjects {
  private readonly workspace = inject(WorkspaceService);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  protected readonly projects = signal<ProjectSummary[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly dialogOpen = signal(false);

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
        this.projects.set(projects);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('Could not load your projects.');
        this.loading.set(false);
      },
    });
  }

  protected openDialog(): void {
    this.dialogOpen.set(true);
  }

  protected closeDialog(): void {
    this.dialogOpen.set(false);
  }

  protected onCreated(project: ProjectDetail): void {
    this.dialogOpen.set(false);

    this.openProject(project.id);
  }

  protected openProject(id: string): void {
    this.router.navigate(['/app/workspace/my-projects', id]);
  }

  protected accentFor(index: number): string {
    return ACCENTS[index % ACCENTS.length];
  }
}
