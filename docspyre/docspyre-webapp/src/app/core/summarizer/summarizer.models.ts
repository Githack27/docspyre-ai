export type SummarizerFormat = 'manual' | 'executive' | 'study_guide' | 'bullet_notes';

export interface NoteImage {
  id: string;
  prompt: string;
  url: string;
  caption: string;
}

export interface NoteSection {
  heading: string;
  level: number;
  content: string;
}

export interface DocumentNote {
  id: string;
  documentId: string;
  title: string;
  subtitle?: string;
  format: SummarizerFormat;
  content: string;
  sections?: NoteSection[];
  images?: NoteImage[];
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface SummarizerStreamEvent {
  type: 'status' | 'token' | 'outline' | 'visual' | 'done' | 'error';
  phase?: string;
  message?: string;
  token?: string;
  data?: {
    title: string;
    subtitle: string;
    sections: Array<{
      heading: string;
      subheadings?: string[];
      keyTopics?: string[];
      requiresTable?: boolean;
      visualPrompt?: string;
    }>;
  };
  image?: NoteImage;
  note?: DocumentNote;
}

export interface GenerateNotesPayload {
  documentId: string;
  workspaceId?: string | null;
  format?: SummarizerFormat;
  customFocus?: string;
  includeImages?: boolean;
}
