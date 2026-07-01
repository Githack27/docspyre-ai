import {
  Component,
  DestroyRef,
  ElementRef,
  PLATFORM_ID,
  afterNextRender,
  computed,
  effect,
  inject,
  signal,
  viewChild,
  viewChildren,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Router } from '@angular/router';
import { forkJoin } from 'rxjs';
import { DocumentService } from '../../../core/documents/document.service';
import { WorkspaceService } from '../../../core/workspace/workspace.service';
import { ShareService } from '../../../core/shares/share.service';
import { AuthService } from '../../../core/auth/auth.service';
import { displayName } from '../../../core/auth/user-display';
import { NavigationService } from '../../../core/navigation/navigation.service';
import {
  DocumentItem,
  formatBytes,
  subtypeAccent,
  subtypeIcon,
  subtypeOf,
  viewerKind,
} from '../../../core/documents/document.models';
import { ProjectSummary } from '../../../core/workspace/workspace.models';
import { DocumentViewer } from '../../shared/ui/document-viewer/document-viewer';

interface QuickAction {
  label: string;
  hint: string;
  icon: string;
  route: string;
  accent: string;
}

interface Kpi {
  key: string;
  label: string;
  value: number;
  decimals: boolean;
  suffix: string;
  icon: string;
  accent: string;
}

interface Suite {
  id: string;
  label: string;
  route: string;
  icon: string;
  accent: string;
  count: number;
}

const SUITE_META: Record<string, { icon: string; accent: string }> = {
  workspace: { icon: 'bi-folder-fill', accent: 'violet' },
  'document-ai': { icon: 'bi-file-earmark-text-fill', accent: 'blue' },
  'research-ai': { icon: 'bi-journal-richtext', accent: 'orange' },
  'media-ai': { icon: 'bi-camera-reels-fill', accent: 'pink' },
  templates: { icon: 'bi-grid-1x2-fill', accent: 'green' },
};

const ACCENTS = ['violet', 'blue', 'pink', 'orange', 'green'];
const WEEK_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

@Component({
  selector: 'app-dashboard',
  imports: [DocumentViewer],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.css',
})
export class Dashboard {
  private readonly documents = inject(DocumentService);
  private readonly workspace = inject(WorkspaceService);
  private readonly shares = inject(ShareService);
  private readonly auth = inject(AuthService);
  private readonly nav = inject(NavigationService);
  private readonly router = inject(Router);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly destroyRef = inject(DestroyRef);

  protected readonly greeting = signal('Welcome back');
  protected readonly today = signal('');
  protected readonly firstName = computed(() => displayName(this.auth.currentUser()).split(' ')[0]);

  protected readonly quickActions: QuickAction[] = [
    { label: 'New Project', hint: 'Start something fresh', icon: 'bi-folder-plus', route: '/app/workspace/my-projects', accent: 'violet' },
    { label: 'Upload', hint: 'Bring in a file', icon: 'bi-cloud-arrow-up-fill', route: '/app/workspace/my-documents', accent: 'blue' },
    { label: 'Chat with Doc', hint: 'Ask your documents', icon: 'bi-chat-dots-fill', route: '/app/document-ai/chat-with-document', accent: 'pink' },
    { label: 'Templates', hint: 'Start from a base', icon: 'bi-grid-1x2-fill', route: '/app/templates/template-marketplace', accent: 'green' },
  ];

  private readonly data = signal<{
    kpis: { projects: number; documents: number; storageMb: number; shared: number };
    recentProjects: ProjectSummary[];
    recentDocs: DocumentItem[];
    week: number[];
    weekTotal: number;
  } | null>(null);

  protected readonly ready = computed(() => this.data() !== null);
  protected readonly recentProjects = computed(() => this.data()?.recentProjects ?? []);
  protected readonly recentDocs = computed(() => this.data()?.recentDocs ?? []);
  protected readonly week = computed(() => this.data()?.week ?? new Array(7).fill(0));
  protected readonly weekTotal = computed(() => this.data()?.weekTotal ?? 0);
  protected readonly weekLabels = WEEK_LABELS;

  protected readonly kpis = computed<Kpi[]>(() => {
    const k = this.data()?.kpis;
    return [
      { key: 'projects', label: 'Projects', value: k?.projects ?? 0, decimals: false, suffix: '', icon: 'bi-folder-fill', accent: 'violet' },
      { key: 'documents', label: 'Documents', value: k?.documents ?? 0, decimals: false, suffix: '', icon: 'bi-file-earmark-richtext-fill', accent: 'blue' },
      { key: 'shared', label: 'Shared with me', value: k?.shared ?? 0, decimals: false, suffix: '', icon: 'bi-people-fill', accent: 'pink' },
      { key: 'storage', label: 'Storage', value: k?.storageMb ?? 0, decimals: true, suffix: 'MB', icon: 'bi-hdd-fill', accent: 'green' },
    ];
  });

  protected readonly suites = computed<Suite[]>(() =>
    this.nav.categories()
      .filter((c) => c.id !== 'overview')
      .map((c) => ({
        id: c.id,
        label: c.label,
        route: c.items[0]?.route ?? c.route,
        icon: SUITE_META[c.id]?.icon ?? 'bi-app',
        accent: SUITE_META[c.id]?.accent ?? 'violet',
        count: c.items.length,
      })),
  );

  protected readonly maxWeek = computed(() => Math.max(1, ...this.week()));
  protected readonly viewing = signal<DocumentItem | null>(null);

  private readonly rootRef = viewChild<ElementRef<HTMLElement>>('root');
  private readonly nums = viewChildren<ElementRef<HTMLElement>>('num');
  private gsap: typeof import('gsap')['gsap'] | null = null;
  private quickX: ((v: number) => void) | null = null;
  private quickY: ((v: number) => void) | null = null;
  private played = false;
  private reduce = false;

  constructor() {
    if (this.isBrowser) {
      this.reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
      this.setGreeting();
      this.load();
      afterNextRender(() => void this.setupGsap());
    }
    effect(() => {
      if (this.ready() && this.gsap && !this.played) {
        this.played = true;
        queueMicrotask(() => this.runIntro());
      }
    });
  }

  private setGreeting(): void {
    const h = new Date().getHours();
    this.greeting.set(h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening');
    this.today.set(new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }));
  }

  private load(): void {
    forkJoin({
      docs: this.documents.list(),
      projects: this.workspace.listProjects(),
      shared: this.shares.sharedWithMe(),
    }).subscribe({
      next: ({ docs, projects, shared }) => {
        const storageMb = docs.reduce((s, d) => s + d.sizeBytes, 0) / (1024 * 1024);

        // 7-day activity (today back 6 days) from docs/projects/shares timestamps.
        const week = new Array(7).fill(0);
        const start = new Date();
        start.setHours(0, 0, 0, 0);
        start.setDate(start.getDate() - 6);
        const bump = (iso: string) => {
          const idx = Math.floor((new Date(iso).setHours(0, 0, 0, 0) - start.getTime()) / 86_400_000);
          if (idx >= 0 && idx < 7) week[idx] += 1;
        };
        docs.forEach((d) => bump(d.createdAt));
        projects.forEach((p) => bump(p.updatedAt));
        shared.forEach((s) => bump(s.sharedAt));

        const recentProjects = [...projects]
          .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
          .slice(0, 4);

        this.data.set({
          kpis: {
            projects: projects.length,
            documents: docs.length,
            storageMb: Math.round(storageMb * 10) / 10,
            shared: shared.length,
          },
          recentProjects,
          recentDocs: docs.slice(0, 5),
          week,
          weekTotal: week.reduce((a, b) => a + b, 0),
        });
      },
      error: () =>
        this.data.set({
          kpis: { projects: 0, documents: 0, storageMb: 0, shared: 0 },
          recentProjects: [],
          recentDocs: [],
          week: new Array(7).fill(0),
          weekTotal: 0,
        }),
    });
  }

  private async setupGsap(): Promise<void> {
    try {
      const mod = await import('gsap');
      this.gsap = mod.gsap;
      if (!this.reduce) {
        this.quickX = this.gsap.quickTo('[data-parallax]', 'xPercent', { duration: 0.9, ease: 'power3' });
        this.quickY = this.gsap.quickTo('[data-parallax]', 'yPercent', { duration: 0.9, ease: 'power3' });
      }
      if (this.ready() && !this.played) {
        this.played = true;
        this.runIntro();
      }
    } catch {
      /* graceful: static values still render */
    }
    this.destroyRef.onDestroy(() => this.gsap?.killTweensOf('*'));
  }

  private runIntro(): void {
    const g = this.gsap;
    const root = this.rootRef()?.nativeElement;
    if (!g || !root) return;
    if (this.reduce) {
      this.paintFinal();
      return;
    }

    g.context(() => {
      const tl = g.timeline({ defaults: { ease: 'power3.out' } });
      tl.from('[data-hero]', { y: 26, opacity: 0, duration: 0.6 });
      tl.from('[data-action]', { y: 20, opacity: 0, duration: 0.5, stagger: 0.07, clearProps: 'transform' }, '-=0.3');
      tl.from('[data-kpi]', { y: 18, opacity: 0, duration: 0.5, stagger: 0.06, clearProps: 'transform' }, '-=0.25');
      tl.from('[data-bar]', { scaleY: 0, transformOrigin: 'bottom', duration: 0.5, stagger: 0.05, ease: 'back.out(1.7)', clearProps: 'transform' }, '-=0.3');
      tl.from('[data-reveal]', { y: 22, opacity: 0, duration: 0.5, stagger: 0.07, clearProps: 'transform' }, '-=0.3');

      this.nums().forEach((ref) => {
        const el = ref.nativeElement;
        const target = Number(el.dataset['target'] ?? '0');
        const decimals = el.dataset['decimals'] === '1';
        const obj = { v: 0 };
        tl.to(obj, {
          v: target,
          duration: 1,
          onUpdate: () => { el.textContent = decimals ? obj.v.toFixed(1) : String(Math.round(obj.v)); },
        }, '<');
      });
    }, root);
  }

  private paintFinal(): void {
    this.nums().forEach((ref) => {
      const el = ref.nativeElement;
      const target = Number(el.dataset['target'] ?? '0');
      el.textContent = el.dataset['decimals'] === '1' ? target.toFixed(1) : String(target);
    });
  }

  // interactions
  protected onPointerMove(event: PointerEvent): void {
    if (!this.quickX || !this.quickY) return;
    const w = window.innerWidth || 1;
    const h = window.innerHeight || 1;
    this.quickX((event.clientX / w - 0.5) * 8);
    this.quickY((event.clientY / h - 0.5) * 8);
  }

  protected tilt(event: PointerEvent): void {
    if (!this.gsap || this.reduce) return;
    const el = event.currentTarget as HTMLElement;
    const r = el.getBoundingClientRect();
    const px = (event.clientX - r.left) / r.width - 0.5;
    const py = (event.clientY - r.top) / r.height - 0.5;
    this.gsap.to(el, { rotateY: px * 9, rotateX: -py * 9, duration: 0.4, ease: 'power2.out', transformPerspective: 700 });
  }

  protected untilt(event: PointerEvent): void {
    if (!this.gsap) return;
    this.gsap.to(event.currentTarget as HTMLElement, { rotateX: 0, rotateY: 0, duration: 0.5, ease: 'power3.out' });
  }

  protected go(route: string): void {
    this.router.navigateByUrl(route);
  }

  protected openProject(id: string): void {
    this.router.navigate(['/app/workspace/my-projects', id]);
  }

  protected openDoc(doc: DocumentItem): void {
    this.viewing.set({ ...doc, kind: viewerKind(doc.name, doc.mimeType) });
  }

  protected closeViewer(): void {
    this.viewing.set(null);
  }

  // presentation helpers
  protected accentAt(i: number): string {
    return ACCENTS[i % ACCENTS.length];
  }
  protected docIcon(doc: DocumentItem): string {
    return subtypeIcon(subtypeOf(doc.name, doc.mimeType));
  }
  protected docAccent(doc: DocumentItem): string {
    return subtypeAccent(subtypeOf(doc.name, doc.mimeType));
  }
  protected size(bytes: number): string {
    return formatBytes(bytes);
  }
  protected barHeight(v: number): number {
    return Math.round((v / this.maxWeek()) * 100);
  }
}
