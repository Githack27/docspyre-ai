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
  
  readonly variant = input<ButtonVariant>('default');
  readonly type = input<ButtonType>('button');
  
  readonly icon = input<string>('');
  readonly iconPosition = input<IconPosition>('left');
  readonly disabled = input<boolean>(false);
  readonly fullWidth = input<boolean>(false);
}
