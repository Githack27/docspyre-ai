import { Routes } from '@angular/router';
import { Overview } from './overview';

export const OVERVIEW_ROUTES: Routes = [
  {
    path: '',
    component: Overview,
    children: [
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
      {
        path: 'dashboard',
        loadComponent: () =>
          import('../../components/overview/dashboard/dashboard').then((m) => m.Dashboard),
      },
      {
        path: 'recent-projects',
        loadComponent: () =>
          import('../../components/overview/recent-projects/recent-projects').then(
            (m) => m.RecentProjects,
          ),
      },
      {
        path: 'docs',
        loadComponent: () => import('../../components/overview/docs/docs').then((m) => m.Docs),
      },
      {
        path: 'about',
        loadComponent: () => import('../../components/overview/about/about').then((m) => m.About),
      },
      {
        path: 'activity',
        loadComponent: () =>
          import('../../components/overview/activity/activity').then((m) => m.Activity),
      },
    ],
  },
];
