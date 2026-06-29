import {
  Component,
  ElementRef,
  HostListener,
  afterNextRender,
  effect,
  inject,
  signal,
  viewChildren,
} from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { Router } from '@angular/router';
import { AuthService } from '../../../core/auth/auth.service';
import { NavCategory, NavigationService } from '../../../core/navigation/navigation.service';
import { ShellService } from '../../../core/shell/shell.service';
import { Button } from '../ui/button/button';

interface UserSummary {
  name: string;
  plan: string;
  credits: string;
}

@Component({
  selector: 'app-header',
  imports: [Button],
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

  protected readonly user = signal<UserSummary>({
    name: 'John Doe',
    plan: 'Basic',
    credits: '24/100 credits',
  });

  constructor() {
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
    this.auth.logout();
    this.router.navigate(['/']);
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
