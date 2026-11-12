import {
  Component,
  DestroyRef,
  ElementRef,
  HostListener,
  afterNextRender,
  computed,
  effect,
  inject,
  signal,
  viewChildren,
} from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { Router } from '@angular/router';
import { AuthService } from '../../../core/auth/auth.service';
import { licenseName, licenseValidity } from '../../../core/auth/license-display';
import { displayName, userInitials } from '../../../core/auth/user-display';
import { NavCategory, NavigationService } from '../../../core/navigation/navigation.service';
import { ShellService } from '../../../core/shell/shell.service';
import { IconButton } from '../ui/icon-button/icon-button';

interface UserSummary {
  name: string;
  initials: string;
  license: string;
  validity: string;
  /** "Enterprise · 365 days" */
  summary: string;
  expired: boolean;
}

/** Re-evaluates the days remaining while the app stays open, so the count drops at midnight. */
const LICENSE_CLOCK_INTERVAL_MS = 60_000;

@Component({
  selector: 'app-header',
  imports: [IconButton],
  templateUrl: './header.html',
  styleUrl: './header.css',
})
export class Header {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly document = inject(DOCUMENT);
  private readonly nav = inject(NavigationService);
  private readonly shell = inject(ShellService);

  private readonly tabButtons = viewChildren<ElementRef<HTMLButtonElement>>('tabBtn');

  protected readonly tabs = this.nav.categories;
  protected readonly activeTab = this.nav.activeCategoryId;
  protected readonly drawerOpen = this.shell.drawerOpen;

  protected readonly indicatorStyle = signal<Record<string, string>>({ opacity: '0' });

  private readonly now = signal(Date.now());

  protected readonly user = computed<UserSummary>(() => {
    const account = this.auth.currentUser();
    const license = account?.license;
    const now = this.now();
    const name = licenseName(license);
    const validity = licenseValidity(license, now);
    return {
      name: displayName(account),
      initials: userInitials(account),
      license: name,
      validity,
      summary: validity ? `${name} · ${validity}` : name,
      expired: Boolean(license?.expiresAt && new Date(license.expiresAt).getTime() <= now),
    };
  });

  constructor() {
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      this.now.set(Date.now());
      const clock = setInterval(() => this.now.set(Date.now()), LICENSE_CLOCK_INTERVAL_MS);
      destroyRef.onDestroy(() => clearInterval(clock));
    });

    afterNextRender(() => {
      this.updateIndicator();
      this.document.fonts?.ready.then(() => this.updateIndicator());
    });

    effect(() => {
      this.activeTab();
      this.updateIndicator();
    });
  }

  protected selectTab(category: NavCategory): void {
    const target = category.items[0]?.route ?? category.route;
    this.router.navigateByUrl(target);
    this.updateIndicator();
  }

  protected toggleDrawer(): void {
    this.shell.toggleDrawer();
  }

  protected logout(): void {
    this.auth.logout().subscribe({
      next: () => this.router.navigate(['/']),
      error: () => this.router.navigate(['/']),
    });
  }

  @HostListener('window:resize')
  protected onResize(): void {
    this.updateIndicator();
  }

  private updateIndicator(retries = 5): void {
    const buttons = this.tabButtons();
    const index = this.tabs().findIndex((tab) => tab.id === this.activeTab());
    const el = buttons[index]?.nativeElement;

    if (!el || el.offsetWidth === 0) {
      if (retries > 0 && typeof requestAnimationFrame !== 'undefined') {
        requestAnimationFrame(() => this.updateIndicator(retries - 1));
      }
      return;
    }

    this.indicatorStyle.set({
      opacity: '1',
      width: `${el.offsetWidth}px`,
      height: `${el.offsetHeight}px`,
      transform: `translate(${el.offsetLeft}px, ${el.offsetTop}px)`,
    });
  }
}
