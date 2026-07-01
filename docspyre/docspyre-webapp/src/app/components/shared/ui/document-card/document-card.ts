import { Component, computed, input, output } from '@angular/core';
import { formatBytes, subtypeAccent, subtypeIcon, subtypeOf } from '../../../../core/documents/document.models';

/**
 * Generic "document holder" card — a preview tile with a type badge, roomy
 * name row and a projected action slot. Reused by My Documents and project
 * files so uploaded files render consistently everywhere.
 */
@Component({
  selector: 'app-document-card',
  imports: [],
  templateUrl: './document-card.html',
  styleUrl: './document-card.css',
})
export class DocumentCard {
  readonly name = input.required<string>();
  readonly mime = input<string | null>('');
  readonly sizeBytes = input<number | null>(0);
  readonly thumbUrl = input<string | null>(null);
  readonly viewable = input<boolean>(true);
  readonly deleting = input<boolean>(false);

  readonly open = output<void>();

  protected readonly sub = computed(() => subtypeOf(this.name(), this.mime()));
  protected readonly icon = computed(() => subtypeIcon(this.sub()));
  protected readonly accent = computed(() => subtypeAccent(this.sub()));
  protected readonly badge = computed(() => this.sub());
  protected readonly isImage = computed(() => this.sub() === 'IMAGE');
  protected readonly sizeLabel = computed(() => formatBytes(this.sizeBytes()));
}
