import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ChatSession, ChatSessionDetail, CreateChatSessionInput, ChatMessage, ChatCitation, ContinueSessionResult } from './chat.models';
import { AuthService } from '../auth/auth.service';

export interface StreamToken {
  token?: string;
  done?: boolean;
  citations?: ChatCitation[];
  claimVerification?: any;
  totalTokens?: number;
  sessionTitle?: string;
  isLimitReached?: boolean;
  error?: string;
  route?: string;
}

@Injectable({ providedIn: 'root' })
export class ChatService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly base = `${environment.apiBaseUrl}/chats`;

  list(filters?: { documentId?: string; workspaceId?: string }): Observable<ChatSession[]> {
    let params = new HttpParams();
    if (filters?.documentId) params = params.set('documentId', filters.documentId);
    if (filters?.workspaceId) params = params.set('workspaceId', filters.workspaceId);
    return this.http
      .get<{ sessions: ChatSession[] }>(this.base, { params })
      .pipe(map((res) => res.sessions));
  }

  create(input: CreateChatSessionInput): Observable<ChatSession> {
    return this.http
      .post<{ session: ChatSession }>(this.base, input)
      .pipe(map((res) => res.session));
  }

  getDetail(sessionId: string): Observable<ChatSessionDetail> {
    return this.http
      .get<{ session: ChatSessionDetail }>(`${this.base}/${sessionId}`)
      .pipe(map((res) => res.session));
  }

  rename(sessionId: string, title: string): Observable<ChatSession> {
    return this.http
      .patch<{ session: ChatSession }>(`${this.base}/${sessionId}/rename`, { title })
      .pipe(map((res) => res.session));
  }

  delete(sessionId: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/${sessionId}`);
  }

  continueSession(sessionId: string): Observable<ContinueSessionResult> {
    return this.http.post<ContinueSessionResult>(`${this.base}/${sessionId}/continue`, {});
  }

  addMessage(sessionId: string, content: string): Observable<ChatMessage> {
    return this.http
      .post<{ message: ChatMessage }>(`${this.base}/${sessionId}/messages`, { content })
      .pipe(map((res) => res.message));
  }

  /**
   * Streams a message via SSE using the RAG pipeline.
   * Returns an observable that emits tokens as they arrive, then completes with citations.
   */
  streamMessage(sessionId: string, content: string, onToken: (data: StreamToken) => void): AbortController {
    const controller = new AbortController();
    const token = this.auth.getAccessToken();

    fetch(`${this.base}/${sessionId}/messages/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ content }),
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok || !response.body) {
          onToken({ done: true });
          return;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let sentDone = false;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            try {
              const parsed: StreamToken = JSON.parse(line.slice(6));
              onToken(parsed);
              if (parsed.done) sentDone = true;
            } catch {
              // Ignore parse errors on partial chunks
            }
          }
        }

        // Process any remaining buffer
        if (buffer.startsWith('data: ')) {
          try {
            const parsed: StreamToken = JSON.parse(buffer.slice(6));
            onToken(parsed);
            if (parsed.done) sentDone = true;
          } catch {
            // Ignore
          }
        }

        // Always ensure done is fired when stream ends
        if (!sentDone) {
          onToken({ done: true });
        }
      })
      .catch(() => {
        onToken({ done: true });
      });

    return controller;
  }
}
