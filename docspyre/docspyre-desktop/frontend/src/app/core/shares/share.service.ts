import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { environment } from '../../../environments/environment';
import { IncomingShare, OutgoingShare, SharePermission, ShareRecipient } from './share.models';

@Injectable({ providedIn: 'root' })
export class ShareService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBaseUrl}/shares`;

  share(documentId: string, userIds: string[], permission: SharePermission): Observable<ShareRecipient[]> {
    return this.http
      .post<{ recipients: ShareRecipient[] }>(this.base, { documentId, userIds, permission })
      .pipe(map((res) => res.recipients));
  }

  recipients(documentId: string): Observable<ShareRecipient[]> {
    return this.http
      .get<{ recipients: ShareRecipient[] }>(`${this.base}/document/${documentId}`)
      .pipe(map((res) => res.recipients));
  }

  revoke(documentId: string, userId: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/${documentId}/${userId}`);
  }

  sharedWithMe(): Observable<IncomingShare[]> {
    return this.http.get<{ items: IncomingShare[] }>(`${this.base}/with-me`).pipe(map((res) => res.items));
  }

  sharedByMe(): Observable<OutgoingShare[]> {
    return this.http.get<{ items: OutgoingShare[] }>(`${this.base}/by-me`).pipe(map((res) => res.items));
  }
}
