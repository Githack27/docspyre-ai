import { Routes } from '@angular/router';
import { Configuration } from './configuration';

export const CONFIGURATION_ROUTES: Routes = [
  {
    path: '',
    component: Configuration,
    children: [
      { path: '', redirectTo: 'settings', pathMatch: 'full' },
      {
        path: 'settings',
        loadComponent: () =>
          import('../../components/configuration/settings/settings').then((m) => m.Settings),
      },
    ],
  },
];
