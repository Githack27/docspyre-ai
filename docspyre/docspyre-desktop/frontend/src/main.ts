import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';
import { initializeDesktopTransport } from './app/core/desktop/desktop';

initializeDesktopTransport();

bootstrapApplication(App, appConfig).catch((err) => console.error(err));
