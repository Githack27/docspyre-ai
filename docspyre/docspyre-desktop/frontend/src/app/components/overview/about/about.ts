import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';


type Accent = 'violet' | 'orange' | 'pink' | 'blue' | 'green';

interface Capability {
  icon: string;
  accent: Accent;
  title: string;
  blurb: string;
  points: string[];
}

interface PipelineStep {
  index: string;
  icon: string;
  accent: Accent;
  title: string;
  text: string;
}

interface Stat {
  value: string;
  label: string;
}

interface Value {
  icon: string;
  accent: Accent;
  title: string;
  text: string;
}

interface Concept {
  icon: string;
  accent: Accent;
  term: string;
  def: string;
}


@Component({
  selector: 'app-about',
  imports: [RouterLink],
  templateUrl: './about.html',
  styleUrl: './about.css',
})
export class About {
  
  protected readonly stats: Stat[] = [
    { value: '25+', label: 'AI tools' },
    { value: '5', label: 'AI suites' },
    { value: '50+', label: 'Languages' },
    { value: '∞', label: 'Ideas' },
  ];

  
  protected readonly capabilities: Capability[] = [
    {
      icon: 'bi-file-earmark-text',
      accent: 'violet',
      title: 'Document AI',
      blurb: 'Turn any document into a conversation.',
      points: ['Chat with documents', 'Convert & translate', 'Summarize & format', 'Build resumes'],
    },
    {
      icon: 'bi-journal-text',
      accent: 'orange',
      title: 'Research AI',
      blurb: 'Research faster, write with confidence.',
      points: ['Research & journal writing', 'Paraphrase', 'Detect AI text', 'Find references'],
    },
    {
      icon: 'bi-soundwave',
      accent: 'pink',
      title: 'Media AI',
      blurb: 'Give your audio and video a voice.',
      points: ['Transcribe speech', 'Translate audio & video', 'Summarize media', 'Voice over'],
    },
    {
      icon: 'bi-grid-1x2',
      accent: 'blue',
      title: 'Templates',
      blurb: 'Start from a head start, every time.',
      points: ['Template marketplace', 'Your own templates', 'Community picks', 'One-click reuse'],
    },
    {
      icon: 'bi-folder2-open',
      accent: 'green',
      title: 'Workspace',
      blurb: 'One home for all your work.',
      points: ['Projects & documents', 'Quick uploads', 'Shared files', 'Safe trash & restore'],
    },
  ];

  
  protected readonly pipeline: PipelineStep[] = [
    {
      index: '01',
      icon: 'bi-cloud-arrow-up',
      accent: 'violet',
      title: 'Upload',
      text: 'Drop in a document, audio, or video. Any format.',
    },
    {
      index: '02',
      icon: 'bi-cpu',
      accent: 'orange',
      title: 'Understand',
      text: 'The AI reads your content and maps what matters.',
    },
    {
      index: '03',
      icon: 'bi-stars',
      accent: 'pink',
      title: 'Create',
      text: 'Generate, translate, or summarize in seconds.',
    },
    {
      index: '04',
      icon: 'bi-send-check',
      accent: 'blue',
      title: 'Deliver',
      text: 'Export clean results in the way you need them.',
    },
  ];

  
  protected readonly values: Value[] = [
    {
      icon: 'bi-lightning-charge',
      accent: 'violet',
      title: 'Built for flow',
      text: 'One pipeline handles every format. No tool-hopping.',
    },
    {
      icon: 'bi-person-check',
      accent: 'orange',
      title: 'You stay in control',
      text: 'AI does the heavy lifting. You make the calls.',
    },
    {
      icon: 'bi-shield-lock',
      accent: 'pink',
      title: 'Private by design',
      text: 'Your files are yours. Always.',
    },
    {
      icon: 'bi-arrows-fullscreen',
      accent: 'blue',
      title: 'Made to scale',
      text: 'From a single page to a full library.',
    },
  ];

  
  protected readonly concepts: Concept[] = [
    {
      icon: 'bi-diagram-3',
      accent: 'violet',
      term: 'AI Pipeline',
      def: 'Many tools working as one smooth flow.',
    },
    {
      icon: 'bi-stack',
      accent: 'orange',
      term: 'Suites',
      def: 'Tools grouped by the job you do.',
    },
    {
      icon: 'bi-bookmark-star',
      accent: 'pink',
      term: 'Templates',
      def: 'Ready-made starts you can reuse.',
    },
    {
      icon: 'bi-shield-check',
      accent: 'blue',
      term: 'Your data',
      def: 'Private, secure and yours alone.',
    },
  ];
}
