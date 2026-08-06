import { Component, computed, inject } from '@angular/core';
import { Header } from '../shared/header/header';
import { Sidebar } from '../shared/sidebar/sidebar';
import { ContentArea } from '../content-area/content-area';
import { NavigationService } from '../../core/navigation/navigation.service';

@Component({
  selector: 'app-layout',
  imports: [Header, Sidebar, ContentArea],
  templateUrl: './layout.html',
  styleUrl: './layout.css',
})
export class Layout {
  private readonly nav = inject(NavigationService);
  protected readonly isConfiguration = computed(() => this.nav.activeCategoryId() === 'configuration');
}
