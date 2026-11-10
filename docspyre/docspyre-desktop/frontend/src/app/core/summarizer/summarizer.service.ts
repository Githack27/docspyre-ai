import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map, firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthService } from '../auth/auth.service';
import type { DocumentNote, GenerateNotesPayload, SummarizerStreamEvent } from './summarizer.models';

@Injectable({ providedIn: 'root' })
export class SummarizerService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly base = `${environment.apiBaseUrl}/summarizer`;

  listNotes(documentId: string): Observable<DocumentNote[]> {
    return this.http
      .get<{ notes: DocumentNote[] }>(`${this.base}/documents/${documentId}/notes`)
      .pipe(map((res) => res.notes));
  }

  getNote(noteId: string): Observable<DocumentNote> {
    return this.http
      .get<{ note: DocumentNote }>(`${this.base}/notes/${noteId}`)
      .pipe(map((res) => res.note));
  }

  deleteNote(noteId: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/notes/${noteId}`);
  }

  streamGenerate(
    payload: GenerateNotesPayload,
    onEvent: (event: SummarizerStreamEvent) => void,
  ): AbortController {
    const controller = new AbortController();

    const executeStream = async (isRetry = false): Promise<void> => {
      const token = this.auth.getAccessToken();

      try {
        const response = await fetch(`${this.base}/generate`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });

        if (response.status === 401 && !isRetry) {
          try {
            await firstValueFrom(this.auth.refresh());
            return executeStream(true);
          } catch {
            onEvent({ type: 'error', message: 'Session expired. Please log in again.' });
            return;
          }
        }

        if (!response.ok || !response.body) {
          let errorMsg = `Server returned status ${response.status}`;
          try {
            const errJson = await response.json();
            if (errJson?.error?.message) errorMsg = errJson.error.message;
          } catch {
            // ignore
          }
          onEvent({ type: 'error', message: errorMsg });
          return;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            try {
              const parsed: SummarizerStreamEvent = JSON.parse(line.slice(6));
              onEvent(parsed);
            } catch {
              // skip unparseable frame
            }
          }
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          onEvent({
            type: 'error',
            message: err instanceof Error ? err.message : 'Stream connection interrupted.',
          });
        }
      }
    };

    executeStream();
    return controller;
  }

  /**
   * Universal, high-fidelity PDF export. Opens print dialog formatted specifically
   * for clean multi-page executive manuals with custom typography, headers, tables,
   * and high-resolution diagrams.
   */
  exportToPdf(note: DocumentNote, renderedHtml: string): void {
    const printWindow = window.open('', '_blank', 'width=900,height=1000');
    if (!printWindow) {
      window.print();
      return;
    }

    const docTitle = note.title || 'Document Manual & Notes';
    const subtitle = note.subtitle || '';
    const dateStr = new Date(note.createdAt).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    const fullHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${docTitle}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;600&display=swap" rel="stylesheet">
  <style>
    @page {
      size: A4;
      margin: 18mm 16mm;
    }
    *, *::before, *::after { box-sizing: border-box; }
    body {
      font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      color: #18181b;
      background: #ffffff;
      line-height: 1.6;
      font-size: 13.5px;
      margin: 0;
      padding: 0;
    }
    .cover-header {
      border-bottom: 2.5px solid #6366f1;
      padding-bottom: 20px;
      margin-bottom: 28px;
    }
    .cover-badge {
      display: inline-block;
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 1.5px;
      text-transform: uppercase;
      color: #6366f1;
      background: #eef2ff;
      padding: 4px 10px;
      border-radius: 999px;
      margin-bottom: 12px;
    }
    h1 {
      font-size: 26px;
      font-weight: 800;
      color: #09090b;
      line-height: 1.25;
      margin: 0 0 8px 0;
      letter-spacing: -0.02em;
    }
    .cover-sub {
      font-size: 15px;
      color: #52525b;
      margin: 0 0 14px 0;
    }
    .cover-meta {
      font-size: 11px;
      color: #71717a;
      display: flex;
      gap: 20px;
    }
    h2 {
      font-size: 18px;
      font-weight: 700;
      color: #1e1b4b;
      border-bottom: 1px solid #e4e4e7;
      padding-bottom: 6px;
      margin: 28px 0 12px 0;
      page-break-after: avoid;
    }
    h3 {
      font-size: 15px;
      font-weight: 600;
      color: #27272a;
      margin: 20px 0 8px 0;
      page-break-after: avoid;
    }
    p {
      margin: 0 0 12px 0;
      color: #27272a;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 16px 0;
      font-size: 12.5px;
      page-break-inside: avoid;
    }
    th, td {
      border: 1px solid #e4e4e7;
      padding: 8px 12px;
      text-align: left;
    }
    th {
      background: #f4f4f5;
      font-weight: 700;
      color: #18181b;
    }
    blockquote {
      border-left: 4px solid #6366f1;
      background: #f8fafc;
      padding: 10px 16px;
      margin: 14px 0;
      border-radius: 0 6px 6px 0;
      color: #334155;
      font-size: 13px;
      page-break-inside: avoid;
    }
    figure {
      margin: 18px 0;
      text-align: center;
      page-break-inside: avoid;
    }
    img {
      max-width: 100%;
      max-height: 380px;
      border-radius: 8px;
      border: 1px solid #e4e4e7;
      object-fit: contain;
    }
    figcaption {
      font-size: 11px;
      color: #71717a;
      margin-top: 6px;
      font-style: italic;
    }
    code {
      font-family: 'JetBrains Mono', monospace;
      font-size: 12px;
      background: #f4f4f5;
      padding: 2px 5px;
      border-radius: 4px;
    }
    pre {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      padding: 12px;
      border-radius: 6px;
      overflow-x: auto;
      font-size: 12px;
      page-break-inside: avoid;
    }
    ul, ol {
      margin: 0 0 14px 0;
      padding-left: 24px;
    }
    li {
      margin-bottom: 5px;
    }
    .footer {
      margin-top: 40px;
      padding-top: 14px;
      border-top: 1px solid #e4e4e7;
      font-size: 10.5px;
      color: #a1a1aa;
      display: flex;
      justify-content: space-between;
    }
  </style>
</head>
<body>
  <div class="cover-header">
    <div class="cover-badge">${note.format.toUpperCase()} GUIDE</div>
    <h1>${docTitle}</h1>
    ${subtitle ? `<div class="cover-sub">${subtitle}</div>` : ''}
    <div class="cover-meta">
      <span>Generated by Docspyre AI</span>
      <span>${dateStr}</span>
    </div>
  </div>
  <div class="manual-content">
    ${renderedHtml}
  </div>
  <div class="footer">
    <span>Docspyre AI Document Reference Manual</span>
    <span>Exported from Document AI</span>
  </div>
  <script>
    window.onload = function() {
      setTimeout(function() {
        window.print();
      }, 500);
    };
  </script>
</body>
</html>`;

    printWindow.document.open();
    printWindow.document.write(fullHtml);
    printWindow.document.close();
  }
}
