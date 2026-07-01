import { Routes } from '@angular/router';
import { DocumentAi } from './document-ai';

export const DOCUMENT_AI_ROUTES: Routes = [
  {
    path: '',
    component: DocumentAi,
    children: [
      { path: '', redirectTo: 'chat-with-document', pathMatch: 'full' },
      {
        path: 'chat-with-document',
        loadComponent: () =>
          import('../../components/document-ai/chat-with-document/chat-with-document').then(
            (m) => m.ChatWithDocument,
          ),
      },
      {
        path: 'document-converter',
        loadComponent: () =>
          import('../../components/document-ai/document-converter/document-converter').then(
            (m) => m.DocumentConverter,
          ),
      },
      {
        path: 'document-translator',
        loadComponent: () =>
          import('../../components/document-ai/document-translator/document-translator').then(
            (m) => m.DocumentTranslator,
          ),
      },
      {
        path: 'ai-formatter',
        loadComponent: () =>
          import('../../components/document-ai/ai-formatter/ai-formatter').then(
            (m) => m.AiFormatter,
          ),
      },
      {
        path: 'ai-writer',
        loadComponent: () =>
          import('../../components/document-ai/ai-writer/ai-writer').then((m) => m.AiWriter),
      },
      {
        path: 'summarizer',
        loadComponent: () =>
          import('../../components/document-ai/summarizer/summarizer').then((m) => m.Summarizer),
      },
      {
        path: 'resume-builder',
        loadComponent: () =>
          import('../../components/document-ai/resume-builder/resume-builder').then(
            (m) => m.ResumeBuilder,
          ),
      },
    ],
  },
];
