import { Routes } from '@angular/router';
import { MediaAi } from './media-ai';

export const MEDIA_AI_ROUTES: Routes = [
  {
    path: '',
    component: MediaAi,
    children: [
      { path: '', redirectTo: 'transcription', pathMatch: 'full' },
      {
        path: 'transcription',
        loadComponent: () =>
          import('../../components/media-ai/transcription/transcription').then(
            (m) => m.Transcription,
          ),
      },
      {
        path: 'audio-translation',
        loadComponent: () =>
          import('../../components/media-ai/audio-translation/audio-translation').then(
            (m) => m.AudioTranslation,
          ),
      },
      {
        path: 'video-translation',
        loadComponent: () =>
          import('../../components/media-ai/video-translation/video-translation').then(
            (m) => m.VideoTranslation,
          ),
      },
      {
        path: 'audio-summarization',
        loadComponent: () =>
          import('../../components/media-ai/audio-summarization/audio-summarization').then(
            (m) => m.AudioSummarization,
          ),
      },
      {
        path: 'video-summarization',
        loadComponent: () =>
          import('../../components/media-ai/video-summarization/video-summarization').then(
            (m) => m.VideoSummarization,
          ),
      },
      {
        path: 'voice-over',
        loadComponent: () =>
          import('../../components/media-ai/voice-over/voice-over').then((m) => m.VoiceOver),
      },
    ],
  },
];
