import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface ConnectedProvider {
  id: string;
  providerId: string;
  providerName: string;
  model: string;
  apiKey: string;
  systemPrompt?: string;
  active: boolean;
}

@Injectable({ providedIn: 'root' })
export class ConfigurationService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiBaseUrl}/configuration`;

  listConfigs(): Observable<ConnectedProvider[]> {
    return this.http.get<ConnectedProvider[]>(this.baseUrl);
  }

  createConfig(data: Omit<ConnectedProvider, 'id'>): Observable<ConnectedProvider> {
    return this.http.post<ConnectedProvider>(this.baseUrl, data);
  }

  updateConfig(id: string, data: Partial<ConnectedProvider>): Observable<ConnectedProvider> {
    return this.http.put<ConnectedProvider>(`${this.baseUrl}/${id}`, data);
  }

  deleteConfig(id: string): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${id}`);
  }
}
