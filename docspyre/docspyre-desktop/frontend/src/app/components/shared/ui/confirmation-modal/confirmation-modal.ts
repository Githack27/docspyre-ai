import { Component, HostListener, inject } from '@angular/core';
import { ConfirmationService } from '../../../../core/confirmation/confirmation.service';

@Component({
  selector: 'app-confirmation-modal',
  standalone: true,
  imports: [],
  templateUrl: './confirmation-modal.html',
  styleUrl: './confirmation-modal.css',
})
export class ConfirmationModal {
  protected readonly confirmationService = inject(ConfirmationService);

  @HostListener('window:keydown.escape', ['$event'])
  handleEscape(event?: Event): void {
    if (this.confirmationService.isOpen()) {
      event?.preventDefault();
      this.confirmationService.handleCancel();
    }
  }

  @HostListener('window:keydown.enter', ['$event'])
  handleEnter(event?: Event): void {
    if (this.confirmationService.isOpen()) {
      event?.preventDefault();
      this.confirmationService.handleConfirm();
    }
  }

  protected defaultIcon(type?: string): string {
    switch (type) {
      case 'danger':
        return 'bi-trash3-fill';
      case 'warning':
        return 'bi-exclamation-triangle-fill';
      case 'info':
        return 'bi-info-circle-fill';
      case 'primary':
      default:
        return 'bi-shield-exclamation';
    }
  }
}
