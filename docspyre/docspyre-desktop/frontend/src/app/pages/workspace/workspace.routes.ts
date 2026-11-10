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
        path: 'my-projects/:projectId',
        loadComponent: () =>
          import('../../components/workspace/my-projects/project-detail/project-detail').then(
            (m) => m.ProjectDetailComponent,
          ),
      },
      {
        path: 'my-documents',
        loadComponent: () =>
          import('../../components/workspace/my-documents/my-documents').then((m) => m.MyDocuments),
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
