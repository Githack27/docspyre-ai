import { Component, effect, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { ThemeService } from '../../../core/theme/theme.service';
import { AuthService } from '../../../core/auth/auth.service';
import { NavigationService, NavItem } from '../../../core/navigation/navigation.service';
import { ShellService } from '../../../core/shell/shell.service';

@Component({
  selector: 'app-sidebar',
  imports: [RouterLink, RouterLinkActive],
  templateUrl: './sidebar.html',
  styleUrl: './sidebar.css',
})
export class Sidebar {
  private readonly theme = inject(ThemeService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly nav = inject(NavigationService);
  private readonly shell = inject(ShellService);

  protected readonly mode = this.theme.mode;
  protected readonly drawerOpen = this.shell.drawerOpen;

  protected readonly categories = this.nav.categories;
  protected readonly activeCategory = this.nav.activeCategory;
  protected readonly activeCategoryId = this.nav.activeCategoryId;

  protected readonly expandedCategory = signal<string>(this.nav.activeCategoryId());

  protected readonly utilityItems = signal<NavItem[]>([
    { id: 'billing', label: 'Billing', icon: 'bi-credit-card', route: '/app/billing' },
    { id: 'settings', label: 'Settings', icon: 'bi-gear', route: '/app/settings' },
  ]);

  constructor() {
    
    effect(() => this.expandedCategory.set(this.activeCategoryId()));
  }

  protected toggleAccordion(id: string): void {
    this.expandedCategory.update((current) => (current === id ? '' : id));
  }

  protected closeDrawer(): void {
    this.shell.closeDrawer();
  }

  protected toggleTheme(): void {
    this.theme.toggle();
  }

  protected logout(): void {
    this.shell.closeDrawer();
    this.auth.logout().subscribe({
      next: () => this.router.navigate(['/']),
      error: () => this.router.navigate(['/']),
    });
  }
}
