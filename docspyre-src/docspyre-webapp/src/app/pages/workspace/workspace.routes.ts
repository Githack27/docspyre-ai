import { Routes } from '@angular/router';
import { Workspace } from './workspace';

export const WORKSPACE_ROUTES: Routes = [
  {
    path: '',
    component: Workspace,
    children: [
      { path: '', redirectTo: 'my-projects', pathMatch: 'full' },
      {
        path: 'my-projects',
        loadComponent: () =>
          import('../../components/workspace/my-projects/my-projects').then((m) => m.MyProjects),
      },
      {
        path: 'my-documents',
        loadComponent: () =>
          import('../../components/workspace/my-documents/my-documents').then((m) => m.MyDocuments),
      },
      {
        path: 'uploads',
        loadComponent: () =>
          import('../../components/workspace/uploads/uploads').then((m) => m.Uploads),
      },
      {
        path: 'shared-files',
        loadComponent: () =>
          import('../../components/workspace/shared-files/shared-files').then((m) => m.SharedFiles),
      },
      {
        path: 'trash',
        loadComponent: () => import('../../components/workspace/trash/trash').then((m) => m.Trash),
      },
    ],
  },
];
