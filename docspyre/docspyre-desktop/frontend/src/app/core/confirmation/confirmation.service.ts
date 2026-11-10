import { Injectable, signal } from '@angular/core';

export type ConfirmationType = 'danger' | 'warning' | 'info' | 'primary';

export interface ConfirmationOptions {
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  type?: ConfirmationType;
  icon?: string;
}

@Injectable({ providedIn: 'root' })
export class ConfirmationService {
  private resolver: ((value: boolean) => void) | null = null;

  readonly isOpen = signal<boolean>(false);
  readonly options = signal<ConfirmationOptions>({
    title: 'Confirm Action',
    message: 'Are you sure you want to proceed?',
    confirmText: 'Confirm',
    cancelText: 'Cancel',
    type: 'danger',
  });

  /**
   * Opens the confirmation modal and returns a Promise resolving to true (confirmed) or false (cancelled).
   */
  confirm(options: ConfirmationOptions): Promise<boolean> {
    if (this.resolver) {
      this.resolver(false);
      this.resolver = null;
    }

    this.options.set({
      title: options.title ?? 'Confirm Action',
      message: options.message,
      confirmText: options.confirmText ?? 'Confirm',
      cancelText: options.cancelText ?? 'Cancel',
      type: options.type ?? 'danger',
      icon: options.icon,
    });

    this.isOpen.set(true);

    return new Promise<boolean>((resolve) => {
      this.resolver = resolve;
    });
  }

  handleConfirm(): void {
    this.isOpen.set(false);
    if (this.resolver) {
      this.resolver(true);
      this.resolver = null;
    }
  }

  handleCancel(): void {
    this.isOpen.set(false);
    if (this.resolver) {
      this.resolver(false);
      this.resolver = null;
    }
  }
}
