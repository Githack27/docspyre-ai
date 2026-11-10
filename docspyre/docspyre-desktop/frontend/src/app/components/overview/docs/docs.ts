import { Component, computed, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

type Accent = 'violet' | 'orange' | 'pink' | 'blue' | 'green';


interface DocItem {
  id: string;
  icon: string;
  title: string;
  route: string;
  what: string;
  steps: string[];
  tip: string;
}


interface DocSuite {
  id: string;
  label: string;
  icon: string;
  accent: Accent;
  tagline: string;
  items: DocItem[];
}


interface DocRow {
  item: DocItem;
  suite: DocSuite;
}


@Component({
  selector: 'app-docs',
  imports: [RouterLink],
  templateUrl: './docs.html',
  styleUrl: './docs.css',
})
export class Docs {
  protected readonly suites = signal<DocSuite[]>([
    {
      id: 'overview',
      label: 'Overview',
      icon: 'bi-compass',
      accent: 'violet',
      tagline: 'Your starting point and home base.',
      items: [
        {
          id: 'dashboard',
          icon: 'bi-speedometer2',
          title: 'Dashboard',
          route: '/app/overview/dashboard',
          what: 'See your activity, usage and quick actions at a glance.',
          steps: ['Open the dashboard', 'Scan recent work and credits', 'Jump into any tool from quick links'],
          tip: 'Start your day here to plan your work.',
        },
        {
          id: 'recent-projects',
          icon: 'bi-clock-history',
          title: 'Recent Projects',
          route: '/app/overview/recent-projects',
          what: 'Pick up exactly where you left off.',
          steps: ['Find your latest projects', 'Click one to reopen', 'Continue editing instantly'],
          tip: 'Items sort by last edit, newest first.',
        },
        {
          id: 'docs',
          icon: 'bi-journal-text',
          title: 'Docs',
          route: '/app/overview/docs',
          what: 'Learn what every tool does and how to use it.',
          steps: ['Choose a suite', 'Open a guide', 'Follow the quick steps'],
          tip: 'Use search to jump straight to a tool.',
        },
        {
          id: 'about',
          icon: 'bi-info-circle',
          title: 'About',
          route: '/app/overview/about',
          what: 'Understand the product and how the pipeline connects.',
          steps: ['Read the overview', 'Explore the five suites', 'See how it all fits together'],
          tip: 'A great first stop for new teammates.',
        },
        {
          id: 'activity',
          icon: 'bi-activity',
          title: 'Activity',
          route: '/app/overview/activity',
          what: 'Track everything you and your team have done.',
          steps: ['Open the activity feed', 'Filter by type or date', 'Review the timeline'],
          tip: 'Spot heavy usage to plan your credits.',
        },
      ],
    },
    {
      id: 'workspace',
      label: 'Workspace',
      icon: 'bi-folder2-open',
      accent: 'green',
      tagline: 'One organized home for all your work.',
      items: [
        {
          id: 'my-projects',
          icon: 'bi-folder',
          title: 'My Projects',
          route: '/app/workspace/my-projects',
          what: 'Group related work into clear projects.',
          steps: ['Create a project', 'Add documents and files', 'Keep related work together'],
          tip: 'Name projects clearly for fast search.',
        },
        {
          id: 'my-documents',
          icon: 'bi-file-earmark-richtext',
          title: 'My Documents',
          route: '/app/workspace/my-documents',
          what: 'Upload, preview and manage your files in one place.',
          steps: ['Drop files to upload', 'Filter by type', 'Open to preview or delete'],
          tip: 'Attach any document to a project from the project page.',
        },
        {
          id: 'shared-files',
          icon: 'bi-share',
          title: 'Shared Files',
          route: '/app/workspace/shared-files',
          what: 'Files shared with you, and by you.',
          steps: ['Open shared files', 'Check who has access', 'Open or manage sharing'],
          tip: 'Set view or edit rights per person.',
        },
        {
          id: 'trash',
          icon: 'bi-trash',
          title: 'Trash',
          route: '/app/workspace/trash',
          what: 'Safely hold deleted items before they go.',
          steps: ['Open trash', 'Restore what you need', 'Empty it to free space'],
          tip: 'Items auto-clear after a set period.',
        },
      ],
    },
    {
      id: 'document-ai',
      label: 'Document AI',
      icon: 'bi-file-earmark-text',
      accent: 'orange',
      tagline: 'Read, write and reshape any document.',
      items: [
        {
          id: 'chat-with-document',
          icon: 'bi-chat-dots',
          title: 'Chat with Document',
          route: '/app/document-ai/chat-with-document',
          what: 'Ask questions and get answers straight from your file.',
          steps: ['Upload a document', 'Ask in plain language', 'Get answers with sources'],
          tip: 'Ask for a summary first to orient yourself.',
        },
        {
          id: 'document-converter',
          icon: 'bi-arrow-left-right',
          title: 'Document Converter',
          route: '/app/document-ai/document-converter',
          what: 'Change a file from one format to another.',
          steps: ['Upload a file', 'Pick the target format', 'Download the result'],
          tip: 'Match formats to keep layout intact.',
        },
        {
          id: 'document-translator',
          icon: 'bi-translate',
          title: 'Document Translator',
          route: '/app/document-ai/document-translator',
          what: 'Translate documents while keeping formatting.',
          steps: ['Upload a document', 'Choose the languages', 'Export the translation'],
          tip: 'Review names and terms after translating.',
        },
        {
          id: 'ai-formatter',
          icon: 'bi-text-paragraph',
          title: 'AI Formatter',
          route: '/app/document-ai/ai-formatter',
          what: 'Clean and structure messy text fast.',
          steps: ['Paste or upload text', 'Pick a style', 'Apply the formatting'],
          tip: 'Use headings to make long docs scannable.',
        },
        {
          id: 'ai-writer',
          icon: 'bi-pencil-square',
          title: 'AI Writer',
          route: '/app/document-ai/ai-writer',
          what: 'Draft content from a short prompt.',
          steps: ['Describe what you need', 'Set tone and length', 'Generate, then refine'],
          tip: 'Give an example to guide the style.',
        },
        {
          id: 'summarizer',
          icon: 'bi-card-text',
          title: 'Summarizer',
          route: '/app/document-ai/summarizer',
          what: 'Turn long content into key points.',
          steps: ['Add your text or file', 'Choose a summary length', 'Get the gist'],
          tip: 'Bullet summaries are great for sharing.',
        },
        {
          id: 'resume-builder',
          icon: 'bi-person-vcard',
          title: 'Resume Builder',
          route: '/app/document-ai/resume-builder',
          what: 'Create a polished resume in minutes.',
          steps: ['Enter your details', 'Pick a template', 'Export to PDF'],
          tip: 'Tailor keywords to each job.',
        },
      ],
    },
    {
      id: 'research-ai',
      label: 'Research AI',
      icon: 'bi-journal-text',
      accent: 'pink',
      tagline: 'Research faster and write with confidence.',
      items: [
        {
          id: 'research-writer',
          icon: 'bi-journal-text',
          title: 'Research Writer',
          route: '/app/research-ai/research-writer',
          what: 'Draft structured research with citations.',
          steps: ['Set your topic', 'Add or suggest sources', 'Build each section'],
          tip: 'Outline first, then expand each part.',
        },
        {
          id: 'journal-writer',
          icon: 'bi-journal-richtext',
          title: 'Journal Writer',
          route: '/app/research-ai/journal-writer',
          what: 'Write journal-ready articles in the right tone.',
          steps: ['Choose a journal style', 'Draft your sections', 'Refine the language'],
          tip: 'Match the target journal format early.',
        },
        {
          id: 'paraphraser',
          icon: 'bi-arrow-repeat',
          title: 'Paraphraser',
          route: '/app/research-ai/paraphraser',
          what: 'Reword text while keeping the meaning.',
          steps: ['Paste your text', 'Pick a tone', 'Get a fresh version'],
          tip: 'Compare side by side before replacing.',
        },
        {
          id: 'ai-detector',
          icon: 'bi-robot',
          title: 'AI Detector',
          route: '/app/research-ai/ai-detector',
          what: 'Check how human-like a text reads.',
          steps: ['Paste the text', 'Run the check', 'Read the score and flags'],
          tip: 'Use it to review, not to judge.',
        },
        {
          id: 'reference-finder',
          icon: 'bi-search',
          title: 'Reference Finder',
          route: '/app/research-ai/reference-finder',
          what: 'Find sources that back your points.',
          steps: ['Enter a topic or claim', 'Browse suggested references', 'Save the best ones'],
          tip: 'Verify each source before citing.',
        },
        {
          id: 'literature-review',
          icon: 'bi-book',
          title: 'Literature Review',
          route: '/app/research-ai/literature-review',
          what: 'Summarize what research already says.',
          steps: ['Add your sources', 'Group them by theme', 'Generate the review'],
          tip: 'Note gaps to shape your own work.',
        },
      ],
    },
    {
      id: 'media-ai',
      label: 'Media AI',
      icon: 'bi-soundwave',
      accent: 'blue',
      tagline: 'Give your audio and video a voice.',
      items: [
        {
          id: 'transcription',
          icon: 'bi-mic',
          title: 'Transcription',
          route: '/app/media-ai/transcription',
          what: 'Turn speech into accurate text.',
          steps: ['Upload audio or video', 'Pick the language', 'Get a clean transcript'],
          tip: 'Clear audio gives the best accuracy.',
        },
        {
          id: 'audio-translation',
          icon: 'bi-music-note-beamed',
          title: 'Audio Translation',
          route: '/app/media-ai/audio-translation',
          what: 'Translate spoken audio into another language.',
          steps: ['Upload audio', 'Choose target language', 'Get translated output'],
          tip: 'Short clips translate fastest.',
        },
        {
          id: 'video-translation',
          icon: 'bi-camera-video',
          title: 'Video Translation',
          route: '/app/media-ai/video-translation',
          what: 'Translate video speech with timing kept.',
          steps: ['Upload a video', 'Set the languages', 'Export audio or subtitles'],
          tip: 'Subtitles are great for accessibility.',
        },
        {
          id: 'audio-summarization',
          icon: 'bi-soundwave',
          title: 'Audio Summarization',
          route: '/app/media-ai/audio-summarization',
          what: 'Get the key points from any audio.',
          steps: ['Upload audio', 'Choose summary depth', 'Read the highlights'],
          tip: 'Perfect for long meetings or lectures.',
        },
        {
          id: 'video-summarization',
          icon: 'bi-film',
          title: 'Video Summarization',
          route: '/app/media-ai/video-summarization',
          what: 'Condense long videos into short notes.',
          steps: ['Upload a video', 'Pick a length', 'Get chapter-style notes'],
          tip: 'Use it to skim before a full watch.',
        },
        {
          id: 'voice-over',
          icon: 'bi-megaphone',
          title: 'Voice Over',
          route: '/app/media-ai/voice-over',
          what: 'Turn text into natural spoken audio.',
          steps: ['Paste your script', 'Pick a voice', 'Generate the audio'],
          tip: 'Add punctuation to shape the pacing.',
        },
      ],
    },
    {
      id: 'templates',
      label: 'Templates',
      icon: 'bi-grid-1x2',
      accent: 'violet',
      tagline: 'Start from a head start, every time.',
      items: [
        {
          id: 'template-marketplace',
          icon: 'bi-shop',
          title: 'Template Marketplace',
          route: '/app/templates/template-marketplace',
          what: 'Discover ready-made templates for any task.',
          steps: ['Browse categories', 'Preview a template', 'Use it instantly'],
          tip: 'Filter by suite to find faster.',
        },
        {
          id: 'my-templates',
          icon: 'bi-grid',
          title: 'My Templates',
          route: '/app/templates/my-templates',
          what: 'Save and reuse your own setups.',
          steps: ['Create or save a template', 'Organize them', 'Reuse anytime'],
          tip: 'Turn a great document into a template.',
        },
        {
          id: 'community-templates',
          icon: 'bi-people',
          title: 'Community Templates',
          route: '/app/templates/community-templates',
          what: 'Use templates shared by other creators.',
          steps: ['Explore community picks', 'Preview and rate', 'Add them to yours'],
          tip: 'Star favorites to build your library.',
        },
      ],
    },
  ]);


  protected readonly query = signal('');
  protected readonly activeSuiteId = signal<string>('overview');
  protected readonly activeItemId = signal<string>('dashboard');


  private readonly allRows = computed<DocRow[]>(() =>
    this.suites().flatMap((suite) => suite.items.map((item) => ({ item, suite }))),
  );

  protected readonly totalItems = computed(() => this.allRows().length);

  protected readonly searching = computed(() => this.query().trim().length > 0);

  protected readonly activeSuite = computed(
    () => this.suites().find((s) => s.id === this.activeSuiteId()) ?? this.suites()[0],
  );


  protected readonly visibleItems = computed<DocRow[]>(() => {
    const q = this.query().trim().toLowerCase();
    if (!q) {
      const suite = this.activeSuite();
      return suite.items.map((item) => ({ item, suite }));
    }
    return this.allRows().filter(
      ({ item }) =>
        item.title.toLowerCase().includes(q) || item.what.toLowerCase().includes(q),
    );
  });


  protected readonly activeRow = computed<DocRow[]>(() => {
    const row = this.allRows().find(({ item }) => item.id === this.activeItemId());
    return row ? [row] : [];
  });


  protected readonly activeAccent = computed(() => this.activeSuite().accent);


  protected selectSuite(id: string): void {
    this.query.set('');
    this.activeSuiteId.set(id);
    const first = this.suites().find((s) => s.id === id)?.items[0];
    if (first) this.activeItemId.set(first.id);
  }

  protected selectItem(id: string): void {
    this.activeItemId.set(id);
  }

  protected onSearch(value: string): void {
    this.query.set(value);
    if (value.trim()) {
      const first = this.visibleItems()[0];
      if (first) this.activeItemId.set(first.item.id);
    }
  }

  protected clearSearch(): void {
    this.query.set('');
  }
}
