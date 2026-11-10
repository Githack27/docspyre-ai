import {
  Component,
  ElementRef,
  HostListener,
  PLATFORM_ID,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { DecimalPipe } from '@angular/common';
import { DocumentService } from '../../../../core/documents/document.service';
import { DocumentItem, DocumentKind } from '../../../../core/documents/document.models';

const PDFJS_VERSION = '3.11.174';
const PDFJS_BASE = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}`;

/** Loads the pdf.js UMD build from CDN once and caches it on window. */
async function ensurePdfjs(): Promise<any> {
  const w = window as unknown as { pdfjsLib?: any };
  if (w.pdfjsLib) return w.pdfjsLib;
  await new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `${PDFJS_BASE}/pdf.min.js`;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load PDF engine'));
    document.head.appendChild(script);
  });
  const lib = (window as unknown as { pdfjsLib: any }).pdfjsLib;
  lib.GlobalWorkerOptions.workerSrc = `${PDFJS_BASE}/pdf.worker.min.js`;
  return lib;
}

@Component({
  selector: 'app-document-viewer',
  imports: [DecimalPipe],
  templateUrl: './document-viewer.html',
  styleUrl: './document-viewer.css',
})
export class DocumentViewer {
  private readonly documents = inject(DocumentService);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  readonly doc = input<DocumentItem | null>(null);
  readonly closed = output<void>();
  readonly deleted = output<string>();

  /** Effective render kind — resolves PDFs by extension even if kind is off. */
  protected readonly renderKind = computed<DocumentKind>(() => {
    const d = this.doc();
    if (!d) return 'OTHER';
    if (d.kind === 'PDF' || d.name.toLowerCase().endsWith('.pdf')) return 'PDF';
    if (d.kind === 'IMAGE' || d.kind === 'VIDEO' || d.kind === 'AUDIO') return d.kind;
    return d.kind;
  });

  protected readonly url = signal<string | null>(null);
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);

  // Image transform
  protected readonly zoom = signal(1);
  protected readonly panX = signal(0);
  protected readonly panY = signal(0);
  private dragOrigin: { x: number; y: number; px: number; py: number } | null = null;

  // Media (video/audio)
  protected readonly playing = signal(false);
  protected readonly muted = signal(false);
  protected readonly currentTime = signal(0);
  protected readonly duration = signal(0);
  protected readonly volume = signal(1);

  // PDF
  protected readonly pdfPage = signal(1);
  protected readonly pdfPages = signal(0);
  protected readonly pdfScale = signal(1.2);
  protected readonly pdfRendering = signal(false);
  private pdfDoc: any = null;

  private readonly mediaRef = viewChild<ElementRef<HTMLMediaElement>>('media');
  private readonly canvasRef = viewChild<ElementRef<HTMLCanvasElement>>('pdfCanvas');

  constructor() {
    effect(() => {
      const target = this.doc();
      untracked(() => this.resetState());
      if (target && this.isBrowser) {
        this.load(target);
      }
    });
  }

  private resetState(): void {
    this.revoke();
    this.url.set(null);
    this.error.set(null);
    this.zoom.set(1);
    this.panX.set(0);
    this.panY.set(0);
    this.playing.set(false);
    this.currentTime.set(0);
    this.duration.set(0);
    this.pdfDoc = null;
    this.pdfPage.set(1);
    this.pdfPages.set(0);
    this.pdfScale.set(1.2);
  }

  private load(target: DocumentItem): void {
    this.loading.set(true);
    this.documents.fetchBlob(target.id).subscribe({
      next: (blob) => {
        this.revoke();
        this.currentUrl = URL.createObjectURL(blob);
        this.url.set(this.currentUrl);
        this.loading.set(false);
        const isPdf = target.kind === 'PDF' || target.name.toLowerCase().endsWith('.pdf');
        if (isPdf) {
          void this.initPdf(blob);
        }
      },
      error: () => {
        this.error.set('This file could not be loaded.');
        this.loading.set(false);
      },
    });
  }

  private currentUrl: string | null = null;
  private revoke(): void {
    if (this.currentUrl) {
      URL.revokeObjectURL(this.currentUrl);
      this.currentUrl = null;
    }
  }

  // --- lifecycle / close -----------------------------------------------------
  protected close(): void {
    const media = this.mediaRef()?.nativeElement;
    if (media) media.pause();
    this.revoke();
    this.closed.emit();
  }

  @HostListener('document:keydown.escape')
  protected onEscape(): void {
    if (this.doc()) this.close();
  }

  protected removeCurrent(): void {
    const target = this.doc();
    if (target) this.deleted.emit(target.id);
  }

  // --- image -----------------------------------------------------------------
  protected zoomBy(delta: number): void {
    this.zoom.set(Math.min(6, Math.max(0.25, +(this.zoom() + delta).toFixed(2))));
  }
  protected resetZoom(): void {
    this.zoom.set(1);
    this.panX.set(0);
    this.panY.set(0);
  }
  protected onWheel(event: WheelEvent): void {
    event.preventDefault();
    this.zoomBy(event.deltaY < 0 ? 0.2 : -0.2);
  }
  protected startPan(event: PointerEvent): void {
    if (this.zoom() <= 1) return;
    this.dragOrigin = { x: event.clientX, y: event.clientY, px: this.panX(), py: this.panY() };
    (event.target as HTMLElement).setPointerCapture(event.pointerId);
  }
  protected movePan(event: PointerEvent): void {
    if (!this.dragOrigin) return;
    this.panX.set(this.dragOrigin.px + (event.clientX - this.dragOrigin.x));
    this.panY.set(this.dragOrigin.py + (event.clientY - this.dragOrigin.y));
  }
  protected endPan(): void {
    this.dragOrigin = null;
  }

  // --- media (video/audio) ---------------------------------------------------
  protected togglePlay(): void {
    const media = this.mediaRef()?.nativeElement;
    if (!media) return;
    if (media.paused) {
      void media.play();
      this.playing.set(true);
    } else {
      media.pause();
      this.playing.set(false);
    }
  }
  protected onLoadedMeta(): void {
    const media = this.mediaRef()?.nativeElement;
    if (media) this.duration.set(media.duration || 0);
  }
  protected onTimeUpdate(): void {
    const media = this.mediaRef()?.nativeElement;
    if (media) this.currentTime.set(media.currentTime);
  }
  protected onEnded(): void {
    this.playing.set(false);
  }
  protected seek(event: Event): void {
    const media = this.mediaRef()?.nativeElement;
    const value = Number((event.target as HTMLInputElement).value);
    if (media) {
      media.currentTime = value;
      this.currentTime.set(value);
    }
  }
  protected setVolume(event: Event): void {
    const media = this.mediaRef()?.nativeElement;
    const value = Number((event.target as HTMLInputElement).value);
    this.volume.set(value);
    if (media) {
      media.volume = value;
      media.muted = value === 0;
      this.muted.set(value === 0);
    }
  }
  protected toggleMute(): void {
    const media = this.mediaRef()?.nativeElement;
    if (!media) return;
    media.muted = !media.muted;
    this.muted.set(media.muted);
  }
  protected toggleFullscreen(): void {
    const media = this.mediaRef()?.nativeElement;
    if (media && 'requestFullscreen' in media) void (media as any).requestFullscreen?.();
  }
  protected get progress(): number {
    const d = this.duration();
    return d > 0 ? (this.currentTime() / d) * 100 : 0;
  }

  // --- pdf -------------------------------------------------------------------
  private async initPdf(blob: Blob): Promise<void> {
    try {
      this.pdfRendering.set(true);
      const data = await blob.arrayBuffer();
      const pdfjs = await ensurePdfjs();
      this.pdfDoc = await pdfjs.getDocument({ data }).promise;
      this.pdfPages.set(this.pdfDoc.numPages);
      this.pdfPage.set(1);
      setTimeout(() => void this.renderPdf(), 60);
    } catch {
      this.error.set('The PDF preview engine could not start.');
      this.pdfRendering.set(false);
    }
  }
  private async renderPdf(): Promise<void> {
    if (!this.pdfDoc) return;
    const canvas = this.canvasRef()?.nativeElement;
    if (!canvas) return;
    this.pdfRendering.set(true);
    try {
      const page = await this.pdfDoc.getPage(this.pdfPage());
      const viewport = page.getViewport({ scale: this.pdfScale() });
      const ctx = canvas.getContext('2d');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      await page.render({ canvasContext: ctx, viewport }).promise;
    } finally {
      this.pdfRendering.set(false);
    }
  }
  protected pdfPrev(): void {
    if (this.pdfPage() > 1) {
      this.pdfPage.update((p) => p - 1);
      void this.renderPdf();
    }
  }
  protected pdfNext(): void {
    if (this.pdfPage() < this.pdfPages()) {
      this.pdfPage.update((p) => p + 1);
      void this.renderPdf();
    }
  }
  protected pdfZoom(delta: number): void {
    this.pdfScale.set(Math.min(3, Math.max(0.5, +(this.pdfScale() + delta).toFixed(2))));
    void this.renderPdf();
  }

  // --- helpers ---------------------------------------------------------------
  protected formatTime(seconds: number): string {
    if (!isFinite(seconds)) return '0:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  }
  protected download(): void {
    const link = this.url();
    const target = this.doc();
    if (!link || !target) return;
    const a = document.createElement('a');
    a.href = link;
    a.download = target.name || 'download';
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
  }
}
