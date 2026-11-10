import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  AddFilePayload,
  CreateProjectPayload,
  ProjectDetail,
  ProjectFile,
  ProjectSummary,
  UserLite,
} from './workspace.models';


@Injectable({ providedIn: 'root' })
export class WorkspaceService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBaseUrl}/workspaces`;
  private readonly usersBase = `${environment.apiBaseUrl}/users`;


  listProjects(): Observable<ProjectSummary[]> {
    return this.http
      .get<{ workspaces: ProjectSummary[] }>(this.base)
      .pipe(map((res) => res.workspaces));
  }


  createProject(payload: CreateProjectPayload): Observable<ProjectDetail> {
    return this.http
      .post<{ workspace: ProjectDetail }>(this.base, payload)
      .pipe(map((res) => res.workspace));
  }


  getProject(id: string): Observable<ProjectDetail> {
    return this.http
      .get<{ workspace: ProjectDetail }>(`${this.base}/${id}`)
      .pipe(map((res) => res.workspace));
  }


  listFiles(id: string): Observable<ProjectFile[]> {
    return this.http
      .get<{ files: ProjectFile[] }>(`${this.base}/${id}/files`)
      .pipe(map((res) => res.files));
  }


  addFile(id: string, payload: AddFilePayload): Observable<ProjectFile> {
    return this.http
      .post<{ file: ProjectFile }>(`${this.base}/${id}/files`, payload)
      .pipe(map((res) => res.file));
  }


  uploadFiles(id: string, files: File[]): Observable<ProjectFile[]> {
    const form = new FormData();
    for (const file of files) form.append('files', file);
    return this.http
      .post<{ files: ProjectFile[] }>(`${this.base}/${id}/files/upload`, form)
      .pipe(map((res) => res.files));
  }


  attachDocument(id: string, documentId: string): Observable<ProjectFile> {
    return this.http
      .post<{ file: ProjectFile }>(`${this.base}/${id}/files/attach`, { documentId })
      .pipe(map((res) => res.file));
  }


  deleteFile(id: string, fileId: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/${id}/files/${fileId}`);
  }


  searchUsers(email: string): Observable<UserLite[]> {
    return this.http
      .get<{ users: UserLite[] }>(`${this.usersBase}/search`, { params: { email } })
      .pipe(map((res) => res.users));
  }
}
