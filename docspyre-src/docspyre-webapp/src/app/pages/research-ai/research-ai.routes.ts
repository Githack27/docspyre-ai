import { Routes } from '@angular/router';
import { ResearchAi } from './research-ai';

export const RESEARCH_AI_ROUTES: Routes = [
  {
    path: '',
    component: ResearchAi,
    children: [
      { path: '', redirectTo: 'research-writer', pathMatch: 'full' },
      {
        path: 'research-writer',
        loadComponent: () =>
          import('../../components/research-ai/research-writer/research-writer').then(
            (m) => m.ResearchWriter,
          ),
      },
      {
        path: 'journal-writer',
        loadComponent: () =>
          import('../../components/research-ai/journal-writer/journal-writer').then(
            (m) => m.JournalWriter,
          ),
      },
      {
        path: 'paraphraser',
        loadComponent: () =>
          import('../../components/research-ai/paraphraser/paraphraser').then((m) => m.Paraphraser),
      },
      {
        path: 'ai-detector',
        loadComponent: () =>
          import('../../components/research-ai/ai-detector/ai-detector').then((m) => m.AiDetector),
      },
      {
        path: 'reference-finder',
        loadComponent: () =>
          import('../../components/research-ai/reference-finder/reference-finder').then(
            (m) => m.ReferenceFinder,
          ),
      },
      {
        path: 'literature-review',
        loadComponent: () =>
          import('../../components/research-ai/literature-review/literature-review').then(
            (m) => m.LiteratureReview,
          ),
      },
    ],
  },
];
