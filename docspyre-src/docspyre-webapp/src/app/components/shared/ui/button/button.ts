import { Component, input } from '@angular/core';

export type ButtonVariant = 'primary' | 'default';
export type ButtonType = 'button' | 'submit' | 'reset';
export type IconPosition = 'left' | 'right';

@Component({
  selector: 'app-button',
  imports: [],
  templateUrl: './button.html',
  styleUrl: './button.css',
})
export class Button {
  /** Set to "primary" for the primary-colored background button. */
  readonly variant = input<ButtonVariant>('default');
  readonly type = input<ButtonType>('button');
  /** Bootstrap icon class, e.g. "bi-box-arrow-in-right". */
  readonly icon = input<string>('');
  readonly iconPosition = input<IconPosition>('left');
  readonly disabled = input<boolean>(false);
  readonly fullWidth = input<boolean>(false);
}
