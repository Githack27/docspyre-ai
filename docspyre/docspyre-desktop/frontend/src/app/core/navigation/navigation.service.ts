import { Injectable, computed, inject, signal } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs';

export interface NavItem {
  id: string;
  label: string;
  icon: string;

  route: string;
}

export interface NavCategory {
  id: string;
  label: string;

  route: string;
  items: NavItem[];
}


@Injectable({ providedIn: 'root' })
export class NavigationService {
  private readonly router = inject(Router);

  readonly categories = signal<NavCategory[]>([
    {
      id: 'overview',
      label: 'Overview',
      route: '/app/overview',
      items: [
        { id: 'dashboard', label: 'Dashboard', icon: 'bi-speedometer2', route: '/app/overview/dashboard' },
        { id: 'recent-projects', label: 'Recent Projects', icon: 'bi-clock-history', route: '/app/overview/recent-projects' },
        { id: 'docs', label: 'Docs', icon: 'bi-file-earmark-text', route: '/app/overview/docs' },
        { id: 'about', label: 'About', icon: 'bi-info-circle', route: '/app/overview/about' },
        { id: 'activity', label: 'Activity', icon: 'bi-activity', route: '/app/overview/activity' },
      ],
    },
    {
      id: 'workspace',
      label: 'Workspace',
      route: '/app/workspace',
      items: [
        { id: 'my-projects', label: 'My Projects', icon: 'bi-folder', route: '/app/workspace/my-projects' },
        { id: 'my-documents', label: 'My Documents', icon: 'bi-file-earmark-richtext', route: '/app/workspace/my-documents' },
        { id: 'shared-files', label: 'Shared Files', icon: 'bi-share', route: '/app/workspace/shared-files' },
        { id: 'trash', label: 'Trash', icon: 'bi-trash', route: '/app/workspace/trash' },
      ],
    },
    {
      id: 'document-ai',
      label: 'Document AI',
      route: '/app/document-ai',
      items: [
        { id: 'chat-with-document', label: 'Chat with Document', icon: 'bi-chat-dots', route: '/app/document-ai/chat-with-document' },
        { id: 'document-converter', label: 'Document Converter', icon: 'bi-arrow-left-right', route: '/app/document-ai/document-converter' },
        { id: 'document-translator', label: 'Document Translator', icon: 'bi-translate', route: '/app/document-ai/document-translator' },
        { id: 'ai-formatter', label: 'AI Formatter', icon: 'bi-text-paragraph', route: '/app/document-ai/ai-formatter' },
        { id: 'ai-writer', label: 'AI Writer', icon: 'bi-pencil-square', route: '/app/document-ai/ai-writer' },
        { id: 'summarizer', label: 'Summarizer', icon: 'bi-card-text', route: '/app/document-ai/summarizer' },
        { id: 'resume-builder', label: 'Resume Builder', icon: 'bi-person-vcard', route: '/app/document-ai/resume-builder' },
      ],
    },
    {
      id: 'research-ai',
      label: 'Research AI',
      route: '/app/research-ai',
      items: [
        { id: 'research-writer', label: 'Research Writer', icon: 'bi-journal-text', route: '/app/research-ai/research-writer' },
        { id: 'journal-writer', label: 'Journal Writer', icon: 'bi-journal-richtext', route: '/app/research-ai/journal-writer' },
        { id: 'paraphraser', label: 'Paraphraser', icon: 'bi-arrow-repeat', route: '/app/research-ai/paraphraser' },
        { id: 'ai-detector', label: 'AI Detector', icon: 'bi-robot', route: '/app/research-ai/ai-detector' },
        { id: 'reference-finder', label: 'Reference Finder', icon: 'bi-search', route: '/app/research-ai/reference-finder' },
        { id: 'literature-review', label: 'Literature Review', icon: 'bi-book', route: '/app/research-ai/literature-review' },
      ],
    },
    {
      id: 'media-ai',
      label: 'Media AI',
      route: '/app/media-ai',
      items: [
        { id: 'transcription', label: 'Transcription', icon: 'bi-mic', route: '/app/media-ai/transcription' },
        { id: 'audio-translation', label: 'Audio Translation', icon: 'bi-music-note-beamed', route: '/app/media-ai/audio-translation' },
        { id: 'video-translation', label: 'Video Translation', icon: 'bi-camera-video', route: '/app/media-ai/video-translation' },
        { id: 'audio-summarization', label: 'Audio Summarization', icon: 'bi-soundwave', route: '/app/media-ai/audio-summarization' },
        { id: 'video-summarization', label: 'Video Summarization', icon: 'bi-film', route: '/app/media-ai/video-summarization' },
        { id: 'voice-over', label: 'Voice Over', icon: 'bi-megaphone', route: '/app/media-ai/voice-over' },
      ],
    },
    {
      id: 'templates',
      label: 'Templates',
      route: '/app/templates',
      items: [
        { id: 'template-marketplace', label: 'Template Marketplace', icon: 'bi-shop', route: '/app/templates/template-marketplace' },
        { id: 'my-templates', label: 'My Templates', icon: 'bi-grid', route: '/app/templates/my-templates' },
        { id: 'community-templates', label: 'Community Templates', icon: 'bi-people', route: '/app/templates/community-templates' },
      ],
    },
    {
      id: 'configuration',
      label: 'Configuration',
      route: '/app/configuration',
      items: [
        { id: 'settings', label: 'Settings', icon: 'bi-gear', route: '/app/configuration/settings' },
      ],
    },
  ]);


  private readonly currentUrl = signal<string>(this.router.url);

  constructor() {
    this.router.events
      .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
      .subscribe((event) => this.currentUrl.set(event.urlAfterRedirects));
  }


  readonly activeCategory = computed(() => {
    const url = this.currentUrl();
    return (
      this.categories().find((category) => url.startsWith(category.route)) ??
      this.categories()[0]
    );
  });

  readonly activeCategoryId = computed(() => this.activeCategory().id);

  readonly activeItemId = computed(() => {
    const url = this.currentUrl();
    return (
      this.activeCategory().items.find((item) => url.startsWith(item.route))?.id ??
      this.activeCategory().items[0]?.id ??
      ''
    );
  });
}
