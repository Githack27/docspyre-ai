import { Component, input, output } from '@angular/core';

@Component({
  selector: 'app-project-card',
  imports: [],
  templateUrl: './project-card.html',
  styleUrl: './project-card.css',
})
export class ProjectCard {
  readonly name = input.required<string>();
  readonly accent = input<string>('violet');
  readonly role = input<string | null>(null);
  readonly members = input<number>(0);
  readonly files = input<number>(0);
  readonly initials = input<string>('');
  readonly timeLabel = input<string | null>(null);

  readonly open = output<void>();
}
