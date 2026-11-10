import { Routes } from '@angular/router';
import { Login } from './components/auth/login/login';
import { Layout } from './components/layout/layout';
import { NotFound } from './pages/not-found/not-found';
import { authGuard, guestGuard } from './core/auth/auth.guard';

export const routes: Routes = [
  { path: '', component: Login, canActivate: [guestGuard] },
  {
    path: 'app',
    component: Layout,
    canActivate: [authGuard],
    children: [
      { path: '', redirectTo: 'overview', pathMatch: 'full' },
      {
        path: 'overview',
        loadChildren: () => import('./pages/overview/overview.routes').then((m) => m.OVERVIEW_ROUTES),
      },
      {
        path: 'workspace',
        loadChildren: () => import('./pages/workspace/workspace.routes').then((m) => m.WORKSPACE_ROUTES),
      },
      {
        path: 'document-ai',
        loadChildren: () => import('./pages/document-ai/document-ai.routes').then((m) => m.DOCUMENT_AI_ROUTES),
      },
      {
        path: 'research-ai',
        loadChildren: () => import('./pages/research-ai/research-ai.routes').then((m) => m.RESEARCH_AI_ROUTES),
      },
      {
        path: 'media-ai',
        loadChildren: () => import('./pages/media-ai/media-ai.routes').then((m) => m.MEDIA_AI_ROUTES),
      },
      {
        path: 'templates',
        loadChildren: () => import('./pages/templates/templates.routes').then((m) => m.TEMPLATES_ROUTES),
      },
      {
        path: 'configuration',
        loadChildren: () => import('./pages/configuration/configuration.routes').then((m) => m.CONFIGURATION_ROUTES),
      },
    ],
  },
  { path: '**', component: NotFound },
];
