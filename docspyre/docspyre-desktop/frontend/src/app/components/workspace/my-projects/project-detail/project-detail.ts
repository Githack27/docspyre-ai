import { Component, PLATFORM_ID, inject, signal } from '@angular/core';
import { isPlatformBrowser, DatePipe } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { WorkspaceService } from '../../../../core/workspace/workspace.service';
import { ProjectDetail, ProjectFile, ProjectMember } from '../../../../core/workspace/workspace.models';
import { displayName, userInitials } from '../../../../core/auth/user-display';
import { DocumentService } from '../../../../core/documents/document.service';
import { DocumentItem, kindFromMime } from '../../../../core/documents/document.models';
import { DocumentViewer } from '../../../shared/ui/document-viewer/document-viewer';
import { DocumentCard } from '../../../shared/ui/document-card/document-card';
import { ChatService } from '../../../../core/chat/chat.service';
import { ChatSession } from '../../../../core/chat/chat.models';

@Component({
  selector: 'app-project-detail',
  imports: [RouterLink, DocumentViewer, DocumentCard, DatePipe],
  templateUrl: './project-detail.html',
  styleUrl: './project-detail.css',
})
export class ProjectDetailComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly workspace = inject(WorkspaceService);
  private readonly documents = inject(DocumentService);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly chatService = inject(ChatService);

  protected readonly project = signal<ProjectDetail | null>(null);
  protected readonly files = signal<ProjectFile[]>([]);
  protected readonly chats = signal<ChatSession[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly uploading = signal(false);
  protected readonly deletingId = signal<string | null>(null);

  protected readonly viewing = signal<DocumentItem | null>(null);

  // "Choose from My Documents" picker state
  protected readonly pickerOpen = signal(false);
  protected readonly pickerDocs = signal<DocumentItem[]>([]);
  protected readonly pickerLoading = signal(false);
  protected readonly attachingId = signal<string | null>(null);

  private projectId = '';

  constructor() {
    this.projectId = this.route.snapshot.paramMap.get('projectId') ?? '';
    if (this.isBrowser) {
      this.load();
    }
  }

  private load(): void {
    this.loading.set(true);
    this.error.set(null);
    this.workspace.getProject(this.projectId).subscribe({
      next: (project) => {
        this.project.set(project);
        this.files.set(project.files);
        this.loading.set(false);
        this.loadChats();
      },
      error: () => {
        this.error.set('This project could not be opened.');
        this.loading.set(false);
      },
    });
  }

  private loadChats(): void {
    this.chatService.list({ workspaceId: this.projectId }).subscribe({
      next: (sessions) => this.chats.set(sessions),
      error: () => {},
    });
  }

  // --- upload new files ------------------------------------------------------
  protected onFilesPicked(event: Event): void {
    const input = event.target as HTMLInputElement;
    const picked = Array.from(input.files ?? []);
    input.value = '';
    if (!picked.length) return;

    this.uploading.set(true);
    this.workspace.uploadFiles(this.projectId, picked).subscribe({
      next: (created) => {
        this.files.update((list) => [...created, ...list]);
        this.uploading.set(false);
      },
      error: () => this.uploading.set(false),
    });
  }

  // --- attach from My Documents ---------------------------------------------
  protected openPicker(): void {
    this.pickerOpen.set(true);
    this.pickerLoading.set(true);
    this.documents.list().subscribe({
      next: (docs) => {
        this.pickerDocs.set(docs);
        this.pickerLoading.set(false);
      },
      error: () => this.pickerLoading.set(false),
    });
  }

  protected closePicker(): void {
    this.pickerOpen.set(false);
  }

  protected attach(doc: DocumentItem): void {
    if (this.attachingId()) return;
    this.attachingId.set(doc.id);
    this.workspace.attachDocument(this.projectId, doc.id).subscribe({
      next: (file) => {
        this.files.update((list) => [file, ...list]);
        this.attachingId.set(null);
        this.pickerOpen.set(false);
      },
      error: () => this.attachingId.set(null),
    });
  }

  // --- view / delete ---------------------------------------------------------
  protected openFile(file: ProjectFile): void {
    if (!file.documentId) return;
    this.viewing.set({
      id: file.documentId,
      name: file.name,
      kind: kindFromMime(file.kind),
      mimeType: file.kind ?? 'application/octet-stream',
      sizeBytes: file.sizeBytes ?? 0,
      createdAt: file.createdAt,
      updatedAt: file.createdAt,
      deletedAt: null,
    });
  }

  protected closeViewer(): void {
    this.viewing.set(null);
  }

  protected removeFile(file: ProjectFile): void {
    if (this.deletingId()) return;
    this.deletingId.set(file.id);
    this.workspace.deleteFile(this.projectId, file.id).subscribe({
      next: () => {
        this.files.update((list) => list.filter((f) => f.id !== file.id));
        this.deletingId.set(null);
      },
      error: () => this.deletingId.set(null),
    });
  }

  protected memberName(m: ProjectMember): string {
    return displayName(m);
  }

  protected memberInitials(m: ProjectMember): string {
    return userInitials(m);
  }

  protected docIcon(kind: DocumentItem['kind']): string {
    switch (kind) {
      case 'IMAGE': return 'bi-image';
      case 'VIDEO': return 'bi-camera-video-fill';
      case 'AUDIO': return 'bi-music-note-beamed';
      case 'PDF': return 'bi-file-earmark-pdf-fill';
      case 'DOCUMENT': return 'bi-file-earmark-text-fill';
      default: return 'bi-file-earmark-fill';
    }
  }

  protected formatSize(bytes: number | null): string {
    if (bytes == null) return '—';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
}
