import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ChatSession, ChatSessionDetail, CreateChatSessionInput, ChatMessage } from './chat.models';

@Injectable({ providedIn: 'root' })
export class ChatService {
  private readonly http = inject(HttpClient);
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

  addMessage(sessionId: string, content: string): Observable<ChatMessage> {
    return this.http
      .post<{ message: ChatMessage }>(`${this.base}/${sessionId}/messages`, { content })
      .pipe(map((res) => res.message));
  }
}
