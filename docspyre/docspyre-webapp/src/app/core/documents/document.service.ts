import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { environment } from '../../../environments/environment';
import { DocumentItem, DocumentKind } from './document.models';

@Injectable({ providedIn: 'root' })
export class DocumentService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBaseUrl}/documents`;

  list(kind?: DocumentKind): Observable<DocumentItem[]> {
    const params = kind ? new HttpParams().set('kind', kind) : undefined;
    return this.http
      .get<{ documents: DocumentItem[] }>(this.base, { params })
      .pipe(map((res) => res.documents));
  }

  upload(files: File[]): Observable<DocumentItem[]> {
    const form = new FormData();
    for (const file of files) form.append('files', file);
    return this.http
      .post<{ documents: DocumentItem[] }>(this.base, form)
      .pipe(map((res) => res.documents));
  }

  listTrash(): Observable<DocumentItem[]> {
    return this.http
      .get<{ documents: DocumentItem[] }>(`${this.base}/trash`)
      .pipe(map((res) => res.documents));
  }

  remove(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/${id}`);
  }

  restore(id: string): Observable<DocumentItem> {
    return this.http
      .post<{ document: DocumentItem }>(`${this.base}/${id}/restore`, {})
      .pipe(map((res) => res.document));
  }

  purge(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/${id}/permanent`);
  }

  /** Fetches the raw file as a Blob (auth header attached by the interceptor). */
  fetchBlob(id: string): Observable<Blob> {
    return this.http.get(`${this.base}/${id}/raw`, { responseType: 'blob' });
  }
}
