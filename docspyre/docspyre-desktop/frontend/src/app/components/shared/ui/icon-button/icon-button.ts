import { Component, input } from '@angular/core';

@Component({
  selector: 'app-icon-button',
  imports: [],
  templateUrl: './icon-button.html',
  styleUrl: './icon-button.css',
})
export class IconButton {
  readonly value = input.required<string>();
  readonly icon = input.required<string>();
  readonly color = input<string>('');
}
