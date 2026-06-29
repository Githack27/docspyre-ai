import { Routes } from '@angular/router';
import { Templates } from './templates';

export const TEMPLATES_ROUTES: Routes = [
  {
    path: '',
    component: Templates,
    children: [
      { path: '', redirectTo: 'template-marketplace', pathMatch: 'full' },
      {
        path: 'template-marketplace',
        loadComponent: () =>
          import('../../components/templates/template-marketplace/template-marketplace').then(
            (m) => m.TemplateMarketplace,
          ),
      },
      {
        path: 'my-templates',
        loadComponent: () =>
          import('../../components/templates/my-templates/my-templates').then((m) => m.MyTemplates),
      },
      {
        path: 'community-templates',
        loadComponent: () =>
          import('../../components/templates/community-templates/community-templates').then(
            (m) => m.CommunityTemplates,
          ),
      },
    ],
  },
];
