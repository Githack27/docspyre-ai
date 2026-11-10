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
import { forkJoin } from 'rxjs';
import { DocumentService } from '../../../core/documents/document.service';
import { WorkspaceService } from '../../../core/workspace/workspace.service';
import { ShareService } from '../../../core/shares/share.service';

interface Stat {
  key: string;
  label: string;
  value: number;
  suffix: string;
  decimals: boolean;
  icon: string;
  accent: string;
  info: string;
}

interface ActivityEvent {
  icon: string;
  text: string;
  at: number;
  accent: string;
}

interface Day {
  date: number;
  count: number;
  level: number | null; // null = out of range (future padding)
}

interface Week {
  month: string | null;
  days: Day[];
}

interface ActivityData {
  metrics: { projects: number; documents: number; storageMb: number; sharedBy: number };
  totals: { total: number; activeDays: number; current: number; longest: number };
  weeks: Week[];
  events: ActivityEvent[];
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKS = 26;
const DAY_MS = 86_400_000;

const INFO: Record<string, { title: string; body: string }> = {
  heatmap: {
    title: 'Contribution activity',
    body: 'Each square is a day over the last 6 months. The greener the square, the more you did that day — uploads, project updates and shares all count. It is the same idea as a code contribution graph, applied to your workspace.',
  },
  streak: {
    title: 'Streaks & totals',
    body: 'Current streak counts consecutive days with activity up to today. Longest streak is your best run in this window. Active days is how many distinct days you did something, and contributions is the total number of actions.',
  },
  projects: { title: 'Projects', body: 'Workspaces you own or belong to. Projects group related files and members.' },
  documents: { title: 'Documents', body: 'Active files in your library across every type. Trashed items are excluded.' },
  shared: { title: 'Shared out', body: 'Files you are sharing — direct shares plus files you added to shared projects.' },
  storage: { title: 'Storage used', body: 'Total size of your active documents on disk. Emptying Trash frees space after 30 days.' },
};

@Component({
  selector: 'app-activity',
  imports: [],
  templateUrl: './activity.html',
  styleUrl: './activity.css',
})
export class Activity {
  private readonly documents = inject(DocumentService);
  private readonly workspace = inject(WorkspaceService);
  private readonly shares = inject(ShareService);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly destroyRef = inject(DestroyRef);

  private readonly data = signal<ActivityData | null>(null);
  protected readonly ready = computed(() => this.data() !== null);
  protected readonly activeInfo = signal<{ title: string; body: string } | null>(null);

  protected readonly weeks = computed<Week[]>(() => this.data()?.weeks ?? this.placeholderWeeks());
  protected readonly events = computed(() => this.data()?.events ?? []);
  protected readonly dayLabels = ['', 'Mon', '', 'Wed', '', 'Fri', ''];

  protected readonly stats = computed<Stat[]>(() => {
    const m = this.data()?.metrics;
    return [
      { key: 'projects', label: 'Projects', value: m?.projects ?? 0, suffix: '', decimals: false, icon: 'bi-folder-fill', accent: 'violet', info: 'projects' },
      { key: 'documents', label: 'Documents', value: m?.documents ?? 0, suffix: '', decimals: false, icon: 'bi-file-earmark-richtext-fill', accent: 'blue', info: 'documents' },
      { key: 'shared', label: 'Shared out', value: m?.sharedBy ?? 0, suffix: '', decimals: false, icon: 'bi-share-fill', accent: 'pink', info: 'shared' },
      { key: 'storage', label: 'Storage', value: m?.storageMb ?? 0, suffix: 'MB', decimals: true, icon: 'bi-hdd-fill', accent: 'green', info: 'storage' },
    ];
  });

  protected readonly track = computed(() => {
    const t = this.data()?.totals;
    return [
      { key: 'current', label: 'Current streak', value: t?.current ?? 0, unit: 'days', icon: 'bi-fire' },
      { key: 'longest', label: 'Longest streak', value: t?.longest ?? 0, unit: 'days', icon: 'bi-trophy-fill' },
      { key: 'active', label: 'Active days', value: t?.activeDays ?? 0, unit: '', icon: 'bi-calendar2-check-fill' },
      { key: 'total', label: 'Contributions', value: t?.total ?? 0, unit: '', icon: 'bi-lightning-charge-fill' },
    ];
  });

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

  private load(): void {
    forkJoin({
      docs: this.documents.list(),
      projects: this.workspace.listProjects(),
      by: this.shares.sharedByMe(),
    }).subscribe({
      next: ({ docs, projects, by }) => {
        const dayCount = new Map<string, number>();
        const bump = (iso: string) => {
          const key = this.dayKey(new Date(iso));
          dayCount.set(key, (dayCount.get(key) ?? 0) + 1);
        };
        docs.forEach((d) => bump(d.createdAt));
        projects.forEach((p) => {
          bump(p.createdAt);
          if (p.updatedAt !== p.createdAt) bump(p.updatedAt);
        });
        by.forEach((s) => bump(s.sharedAt));

        const { weeks, totals } = this.buildCalendar(dayCount);

        const events: ActivityEvent[] = [
          ...docs.slice(0, 6).map((d) => ({ icon: 'bi-cloud-arrow-up-fill', text: `Uploaded ${d.name}`, at: new Date(d.createdAt).getTime(), accent: 'blue' })),
          ...projects.slice(0, 4).map((p) => ({ icon: 'bi-folder-fill', text: `Updated ${p.name}`, at: new Date(p.updatedAt).getTime(), accent: 'violet' })),
          ...by.slice(0, 3).map((s) => ({ icon: 'bi-send-fill', text: `Shared ${s.name}`, at: new Date(s.sharedAt).getTime(), accent: 'pink' })),
        ].sort((a, b) => b.at - a.at).slice(0, 6);

        const storageMb = docs.reduce((sum, d) => sum + d.sizeBytes, 0) / (1024 * 1024);

        this.data.set({
          metrics: {
            projects: projects.length,
            documents: docs.length,
            storageMb: Math.round(storageMb * 10) / 10,
            sharedBy: by.length,
          },
          totals,
          weeks,
          events,
        });
      },
      error: () =>
        this.data.set({
          metrics: { projects: 0, documents: 0, storageMb: 0, sharedBy: 0 },
          totals: { total: 0, activeDays: 0, current: 0, longest: 0 },
          weeks: this.placeholderWeeks(),
          events: [],
        }),
    });
  }

  private dayKey(d: Date): string {
    return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  }

  private levelOf(count: number): number {
    if (count <= 0) return 0;
    if (count === 1) return 1;
    if (count === 2) return 2;
    if (count <= 4) return 3;
    return 4;
  }

  private buildCalendar(dayCount: Map<string, number>): { weeks: Week[]; totals: ActivityData['totals'] } {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const end = new Date(today);
    end.setDate(end.getDate() + (6 - end.getDay())); // Saturday of current week
    const start = new Date(end);
    start.setDate(start.getDate() - (WEEKS * 7 - 1)); // aligned to a Sunday

    const days: Day[] = [];
    for (let t = start.getTime(); t <= end.getTime(); t += DAY_MS) {
      const d = new Date(t);
      if (t > today.getTime()) {
        days.push({ date: t, count: 0, level: null });
      } else {
        const c = dayCount.get(this.dayKey(d)) ?? 0;
        days.push({ date: t, count: c, level: this.levelOf(c) });
      }
    }

    const weeks: Week[] = [];
    for (let i = 0; i < days.length; i += 7) {
      weeks.push({ month: null, days: days.slice(i, i + 7) });
    }
    let lastMonth = -1;
    for (const w of weeks) {
      const m = new Date(w.days[0].date).getMonth();
      if (m !== lastMonth) {
        w.month = MONTHS[m];
        lastMonth = m;
      }
    }

    const inRange = days.filter((d) => d.level !== null);
    const total = inRange.reduce((s, d) => s + d.count, 0);
    const activeDays = inRange.filter((d) => d.count > 0).length;
    let longest = 0;
    let run = 0;
    for (const d of inRange) {
      if (d.count > 0) {
        run += 1;
        longest = Math.max(longest, run);
      } else {
        run = 0;
      }
    }
    let current = 0;
    for (let i = inRange.length - 1; i >= 0; i -= 1) {
      if (inRange[i].count > 0) current += 1;
      else break;
    }

    return { weeks, totals: { total, activeDays, current, longest } };
  }

  private placeholderWeeks(): Week[] {
    return Array.from({ length: WEEKS }, () => ({
      month: null,
      days: Array.from({ length: 7 }, () => ({ date: 0, count: 0, level: 0 })),
    }));
  }

  private async setupGsap(): Promise<void> {
    try {
      const mod = await import('gsap');
      this.gsap = mod.gsap;
      if (!this.reduce) {
        this.quickX = this.gsap.quickTo('[data-parallax]', 'xPercent', { duration: 0.8, ease: 'power3' });
        this.quickY = this.gsap.quickTo('[data-parallax]', 'yPercent', { duration: 0.8, ease: 'power3' });
      }
      if (this.ready() && !this.played) {
        this.played = true;
        this.runIntro();
      }
    } catch {
      /* GSAP failed to load — real values still render. */
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
      tl.from('[data-reveal]', { y: 24, opacity: 0, duration: 0.55, stagger: 0.06, clearProps: 'transform' });
      tl.from('[data-cell]', { scale: 0, opacity: 0, duration: 0.28, ease: 'back.out(1.7)', stagger: { each: 0.004, from: 'start' }, clearProps: 'transform' }, '-=0.2');

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

      tl.from('[data-event]', { y: 14, opacity: 0, duration: 0.45, stagger: 0.08, clearProps: 'transform' }, '-=0.8');
    }, root);
  }

  private paintFinal(): void {
    this.nums().forEach((ref) => {
      const el = ref.nativeElement;
      const target = Number(el.dataset['target'] ?? '0');
      el.textContent = el.dataset['decimals'] === '1' ? target.toFixed(1) : String(target);
    });
  }

  protected onPointerMove(event: PointerEvent): void {
    if (!this.quickX || !this.quickY) return;
    const w = window.innerWidth || 1;
    const h = window.innerHeight || 1;
    this.quickX((event.clientX / w - 0.5) * 6);
    this.quickY((event.clientY / h - 0.5) * 6);
  }

  protected tilt(event: PointerEvent): void {
    if (!this.gsap || this.reduce) return;
    const el = event.currentTarget as HTMLElement;
    const r = el.getBoundingClientRect();
    const px = (event.clientX - r.left) / r.width - 0.5;
    const py = (event.clientY - r.top) / r.height - 0.5;
    this.gsap.to(el, { rotateY: px * 8, rotateX: -py * 8, duration: 0.4, ease: 'power2.out', transformPerspective: 700 });
  }

  protected untilt(event: PointerEvent): void {
    if (!this.gsap) return;
    this.gsap.to(event.currentTarget as HTMLElement, { rotateX: 0, rotateY: 0, duration: 0.5, ease: 'power3.out' });
  }

  protected openInfo(key: string): void {
    const content = INFO[key];
    if (content) this.activeInfo.set(content);
  }

  protected closeInfo(): void {
    this.activeInfo.set(null);
  }

  protected relTime(at: number): string {
    const diff = Date.now() - at;
    const min = 60_000, hr = 3_600_000, day = 86_400_000;
    if (diff < min) return 'just now';
    if (diff < hr) return `${Math.floor(diff / min)}m ago`;
    if (diff < day) return `${Math.floor(diff / hr)}h ago`;
    return `${Math.floor(diff / day)}d ago`;
  }
}
