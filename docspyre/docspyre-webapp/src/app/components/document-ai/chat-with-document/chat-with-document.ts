import { Component, PLATFORM_ID, computed, inject, signal, effect } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ChatService } from '../../../core/chat/chat.service';
import { ChatSession, ChatMessage, ChatSessionDetail } from '../../../core/chat/chat.models';
import { DocumentService } from '../../../core/documents/document.service';
import { DocumentItem, viewerKind, kindFromMime } from '../../../core/documents/document.models';
import { WorkspaceService } from '../../../core/workspace/workspace.service';
import { ProjectSummary, ProjectDetail, ProjectFile } from '../../../core/workspace/workspace.models';
import { DocumentCard } from '../../shared/ui/document-card/document-card';
import { MarkdownPipe } from '../../../core/markdown/markdown-pipe';

@Component({
  selector: 'app-chat-with-document',
  imports: [FormsModule, DocumentCard, MarkdownPipe],
  templateUrl: './chat-with-document.html',
  styleUrl: './chat-with-document.css',
})
export class ChatWithDocument {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly chatService = inject(ChatService);
  private readonly documentService = inject(DocumentService);
  private readonly workspaceService = inject(WorkspaceService);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  protected readonly kindFromMime = kindFromMime;

  // Navigation / Selection State
  protected readonly selectedTab = signal<'my-documents' | 'projects'>('my-documents');
  protected readonly personalDocs = signal<DocumentItem[]>([]);
  protected readonly projects = signal<ProjectSummary[]>([]);
  protected readonly activeProject = signal<ProjectDetail | null>(null);

  // Active Selection
  protected readonly selectedDoc = signal<{
    id: string; // Document ID (or fallback)
    name: string;
    kind: string;
    sizeBytes: number;
    workspaceId?: string | null;
    workspaceFileId?: string | null;
  } | null>(null);

  // Chat State
  protected readonly sessions = signal<ChatSession[]>([]);
  protected readonly activeSession = signal<ChatSessionDetail | null>(null);
  protected readonly activeSessionId = signal<string | null>(null);
  protected readonly messages = signal<ChatMessage[]>([]);
  protected readonly newMessage = signal<string>('');

  // UI Loaders
  protected readonly loadingDocs = signal<boolean>(false);
  protected readonly loadingChat = signal<boolean>(false);
  protected readonly sending = signal<boolean>(false);
  protected readonly uploading = signal<boolean>(false);
  protected readonly dragging = signal<boolean>(false);

  // Editing Session Title state
  protected readonly editingSessionId = signal<string | null>(null);
  protected readonly editingSessionTitle = signal<string>('');

  constructor() {
    if (this.isBrowser) {
      this.loadInitialData();
      this.handleRouteParams();
    }
  }

  private loadInitialData(): void {
    this.loadingDocs.set(true);
    // Fetch personal documents
    this.documentService.list().subscribe({
      next: (docs) => {
        this.personalDocs.set(docs);
        this.loadingDocs.set(false);
      },
      error: () => this.loadingDocs.set(false),
    });

    // Fetch workspaces / projects
    this.workspaceService.listProjects().subscribe({
      next: (projs) => {
        this.projects.set(projs);
      },
      error: () => {},
    });
  }

  private handleRouteParams(): void {
    this.route.queryParams.subscribe((params) => {
      const sessionId = params['sessionId'];
      const documentId = params['documentId'];
      const projectId = params['projectId'];
      const fileId = params['fileId'];

      if (sessionId) {
        this.loadSessionDirectly(sessionId);
      } else if (projectId && fileId) {
        this.selectProjectFileDirectly(projectId, fileId);
      } else if (documentId) {
        this.selectDocumentDirectly(documentId);
      }
    });
  }

  // --- Router Auto-Selection helpers ------------------------------------------

  private loadSessionDirectly(sessionId: string): void {
    this.loadingChat.set(true);
    this.chatService.getDetail(sessionId).subscribe({
      next: (detail) => {
        this.activeSession.set(detail);
        this.activeSessionId.set(detail.id);
        this.messages.set(detail.messages);

        // Fetch document info if linked
        if (detail.workspaceId && detail.workspaceFileId) {
          this.workspaceService.getProject(detail.workspaceId).subscribe({
            next: (project) => {
              const file = project.files.find((f) => f.id === detail.workspaceFileId);
              if (file) {
                this.selectedDoc.set({
                  id: file.documentId || file.id,
                  name: file.name,
                  kind: kindFromMime(file.kind),
                  sizeBytes: file.sizeBytes || 0,
                  workspaceId: detail.workspaceId,
                  workspaceFileId: detail.workspaceFileId,
                });
                this.loadChatSessions(file.documentId || file.id, detail.workspaceId);
              }
            },
          });
        } else if (detail.documentId) {
          this.documentService.list().subscribe({
            next: (docs) => {
              const doc = docs.find((d) => d.id === detail.documentId);
              if (doc) {
                this.selectedDoc.set({
                  id: doc.id,
                  name: doc.name,
                  kind: doc.kind,
                  sizeBytes: doc.sizeBytes,
                  workspaceId: null,
                  workspaceFileId: null,
                });
                this.loadChatSessions(doc.id, null);
              }
            },
          });
        }
        this.loadingChat.set(false);
      },
      error: () => {
        this.loadingChat.set(false);
        this.router.navigate([], { queryParams: {} });
      },
    });
  }

  private selectDocumentDirectly(documentId: string): void {
    this.documentService.list().subscribe({
      next: (docs) => {
        const doc = docs.find((d) => d.id === documentId);
        if (doc) {
          this.selectDoc({
            id: doc.id,
            name: doc.name,
            kind: doc.kind,
            sizeBytes: doc.sizeBytes,
            workspaceId: null,
            workspaceFileId: null,
          });
        }
      },
    });
  }

  private selectProjectFileDirectly(projectId: string, fileId: string): void {
    this.selectedTab.set('projects');
    this.workspaceService.getProject(projectId).subscribe({
      next: (project) => {
        this.activeProject.set(project);
        const file = project.files.find((f) => f.id === fileId);
        if (file) {
          this.selectDoc({
            id: file.documentId || file.id,
            name: file.name,
            kind: kindFromMime(file.kind),
            sizeBytes: file.sizeBytes || 0,
            workspaceId: projectId,
            workspaceFileId: fileId,
          });
        }
      },
    });
  }

  // --- Document Selection Methods --------------------------------------------

  protected setTab(tab: 'my-documents' | 'projects'): void {
    this.selectedTab.set(tab);
    this.activeProject.set(null);
  }

  protected selectProject(project: ProjectSummary): void {
    this.workspaceService.getProject(project.id).subscribe({
      next: (detail) => {
        this.activeProject.set(detail);
      },
    });
  }

  protected deselectProject(): void {
    this.activeProject.set(null);
  }

  protected selectDoc(doc: {
    id: string;
    name: string;
    kind: string;
    sizeBytes: number;
    workspaceId?: string | null;
    workspaceFileId?: string | null;
  }): void {
    this.selectedDoc.set(doc);
    this.loadChatSessions(doc.id, doc.workspaceId);
  }

  protected deselectDoc(): void {
    this.selectedDoc.set(null);
    this.activeSession.set(null);
    this.activeSessionId.set(null);
    this.messages.set([]);
    this.sessions.set([]);
    // Clear query params
    this.router.navigate([], { queryParams: {} });
  }

  // --- Chat Session Operations ------------------------------------------------

  private loadChatSessions(docId: string, workspaceId?: string | null): void {
    this.chatService
      .list({
        documentId: workspaceId ? undefined : docId,
        workspaceId: workspaceId || undefined,
      })
      .subscribe({
        next: (list) => {
          // If we chat with a project file, filters might return all workspace chats.
          // Let's filter to those matching this specific file:
          const filtered = workspaceId
            ? list.filter((s) => s.workspaceFileId === this.selectedDoc()?.workspaceFileId)
            : list;

          this.sessions.set(filtered);

          // Auto-select latest active session if none is selected
          if (filtered.length && !this.activeSessionId()) {
            this.selectSession(filtered[0].id);
          } else if (!filtered.length) {
            this.activeSession.set(null);
            this.activeSessionId.set(null);
            this.messages.set([]);
          }
        },
      });
  }

  protected selectSession(sessionId: string): void {
    this.loadingChat.set(true);
    this.chatService.getDetail(sessionId).subscribe({
      next: (detail) => {
        this.activeSession.set(detail);
        this.activeSessionId.set(detail.id);
        this.messages.set(detail.messages);
        this.loadingChat.set(false);

        // Update URL
        this.router.navigate([], {
          queryParams: { sessionId },
          queryParamsHandling: 'merge',
        });

        // Scroll to bottom
        this.scrollToBottom();
      },
      error: () => this.loadingChat.set(false),
    });
  }

  protected createNewSession(): void {
    const doc = this.selectedDoc();
    if (!doc) return;

    const title = `Chat on ${doc.name}`;
    this.chatService
      .create({
        title,
        documentId: doc.workspaceId ? undefined : doc.id,
        workspaceId: doc.workspaceId || undefined,
        workspaceFileId: doc.workspaceFileId || undefined,
      })
      .subscribe({
        next: (session) => {
          this.sessions.update((list) => [session, ...list]);
          this.selectSession(session.id);
        },
      });
  }

  // --- Editing Title ---------------------------------------------------------

  protected startRename(session: ChatSession, event: Event): void {
    event.stopPropagation();
    this.editingSessionId.set(session.id);
    this.editingSessionTitle.set(session.title);
  }

  protected saveRename(session: ChatSession): void {
    const nextTitle = this.editingSessionTitle().trim();
    if (!nextTitle || nextTitle === session.title) {
      this.editingSessionId.set(null);
      return;
    }

    this.chatService.rename(session.id, nextTitle).subscribe({
      next: (updated) => {
        this.sessions.update((list) => list.map((s) => (s.id === updated.id ? updated : s)));
        if (this.activeSessionId() === session.id) {
          this.activeSession.update((current) => current ? { ...current, title: updated.title } : null);
        }
        this.editingSessionId.set(null);
      },
      error: () => this.editingSessionId.set(null),
    });
  }

  protected cancelRename(): void {
    this.editingSessionId.set(null);
  }

  // --- Delete Session --------------------------------------------------------

  protected deleteSession(session: ChatSession, event: Event): void {
    event.stopPropagation();
    if (!confirm(`Are you sure you want to delete "${session.title}"?`)) return;

    this.chatService.delete(session.id).subscribe({
      next: () => {
        this.sessions.update((list) => list.filter((s) => s.id !== session.id));
        if (this.activeSessionId() === session.id) {
          this.activeSession.set(null);
          this.activeSessionId.set(null);
          this.messages.set([]);
          this.router.navigate([], {
            queryParams: { sessionId: null },
            queryParamsHandling: 'merge',
          });
        }
      },
    });
  }

  // --- Messages --------------------------------------------------------------

  protected sendMessage(): void {
    const text = this.newMessage().trim();
    if (!text || this.sending()) return;

    const doc = this.selectedDoc();
    if (!doc) return;

    // Helper: Send message block
    const performSend = (sessionId: string) => {
      this.sending.set(true);
      this.newMessage.set('');

      // Optimistically add user message to list
      const tempUserMsg: ChatMessage = {
        id: 'temp-user-' + Date.now(),
        sessionId,
        senderId: 'user',
        role: 'user',
        content: text,
        createdAt: new Date().toISOString(),
      };
      this.messages.update((list) => [...list, tempUserMsg]);
      this.scrollToBottom();

      // Add streaming AI message placeholder
      const streamingMsgId = 'temp-ai-streaming-' + Date.now();
      const streamingAiMsg: ChatMessage = {
        id: streamingMsgId,
        sessionId,
        senderId: null,
        role: 'assistant',
        content: '',
        createdAt: new Date().toISOString(),
      };
      this.messages.update((list) => [...list, streamingAiMsg]);
      this.scrollToBottom();

      let receivedAnyToken = false;

      this.chatService.streamMessage(sessionId, text, (data) => {
        if (data.token) {
          receivedAnyToken = true;
          // Append token to the streaming message
          this.messages.update((list) =>
            list.map((m) =>
              m.id === streamingMsgId
                ? { ...m, content: m.content + data.token }
                : m
            )
          );
          this.scrollToBottom();
        }

        if (data.done) {
          if (receivedAnyToken) {
            // Streaming succeeded — reload session to get persisted messages
            this.chatService.getDetail(sessionId).subscribe({
              next: (detail) => {
                this.messages.set(detail.messages);
                this.sending.set(false);
                this.scrollToBottom();
              },
              error: () => this.sending.set(false),
            });
          } else {
            // Stream produced no tokens (failed or provider unavailable).
            // Fall back to the non-streaming endpoint.
            this.messages.update((list) => list.filter((m) => m.id !== streamingMsgId));
            this.chatService.addMessage(sessionId, text).subscribe({
              next: () => {
                this.chatService.getDetail(sessionId).subscribe({
                  next: (detail) => {
                    this.messages.set(detail.messages);
                    this.sending.set(false);
                    this.scrollToBottom();
                  },
                  error: () => this.sending.set(false),
                });
              },
              error: () => {
                // Even fallback failed — just keep the user message visible
                this.messages.update((list) => list.filter((m) => m.id !== streamingMsgId));
                this.sending.set(false);
              },
            });
          }
        }
      });
    };

    // If no session is active, automatically create one first
    if (!this.activeSessionId()) {
      const title = `Chat on ${doc.name}`;
      this.chatService
        .create({
          title,
          documentId: doc.workspaceId ? undefined : doc.id,
          workspaceId: doc.workspaceId || undefined,
          workspaceFileId: doc.workspaceFileId || undefined,
        })
        .subscribe({
          next: (session) => {
            this.sessions.update((list) => [session, ...list]);
            this.activeSessionId.set(session.id);
            // Now send the message
            performSend(session.id);
          },
        });
    } else {
      performSend(this.activeSessionId()!);
    }
  }

  protected onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.sendMessage();
    }
  }

  // --- Uploading files directly inside Select view ---------------------------

  protected onFilesPicked(event: Event): void {
    const input = event.target as HTMLInputElement;
    const picked = Array.from(input.files ?? []);
    input.value = '';
    this.upload(picked);
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
    this.documentService.upload(files).subscribe({
      next: (created) => {
        this.personalDocs.update((list) => [...created, ...list]);
        this.uploading.set(false);
        // Automatically select the first uploaded document
        if (created.length) {
          this.selectDoc({
            id: created[0].id,
            name: created[0].name,
            kind: created[0].kind,
            sizeBytes: created[0].sizeBytes,
            workspaceId: null,
            workspaceFileId: null,
          });
        }
      },
      error: () => {
        this.uploading.set(false);
      },
    });
  }

  // --- UI Helpers -------------------------------------------------------------

  private scrollToBottom(): void {
    if (!this.isBrowser) return;
    setTimeout(() => {
      const chatArea = document.querySelector('.chat-win__messages');
      if (chatArea) {
        chatArea.scrollTop = chatArea.scrollHeight;
      }
    }, 100);
  }

  protected docIcon(kind: string): string {
    switch (kind) {
      case 'IMAGE': return 'bi-image';
      case 'VIDEO': return 'bi-camera-video-fill';
      case 'AUDIO': return 'bi-music-note-beamed';
      case 'PDF': return 'bi-file-earmark-pdf-fill';
      case 'DOCUMENT': return 'bi-file-earmark-text-fill';
      default: return 'bi-file-earmark-fill';
    }
  }

  protected docAccent(kind: string): string {
    switch (kind) {
      case 'IMAGE': return 'blue';
      case 'VIDEO': return 'pink';
      case 'AUDIO': return 'green';
      case 'PDF': return 'orange';
      case 'DOCUMENT': return 'violet';
      default: return 'violet';
    }
  }

  protected formatSize(bytes: number): string {
    if (bytes === 0) return '0 B';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
}
