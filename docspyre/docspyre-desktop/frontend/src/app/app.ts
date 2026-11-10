import { Component, OnInit, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ConfirmationModal } from './components/shared/ui/confirmation-modal/confirmation-modal';
import { inDesktop, initializeDesktopTransport, notifyFrontendReady } from './core/desktop/desktop';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, ConfirmationModal],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App implements OnInit {
  protected readonly title = signal('Docspyre');

  ngOnInit(): void {
    if (inDesktop()) {
      initializeDesktopTransport();
      notifyFrontendReady().catch((err) => {
        console.error('Failed to notify desktop supervisor:', err);
      });
    }
  }
}
