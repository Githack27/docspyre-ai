import { Annotation } from '@langchain/langgraph';
import type { SummarizerFormat } from '../prompts/summarizer.prompt';

export interface NoteImage {
  id: string;
  prompt: string;
  url: string;
  caption: string;
}

export interface OutlineSection {
  heading: string;
  subheadings?: string[];
  keyTopics?: string[];
  requiresTable?: boolean;
  tableDescription?: string;
  visualPrompt?: string;
}

export interface OutlineData {
  title: string;
  subtitle: string;
  targetAudience?: string;
  sections: OutlineSection[];
}

/**
 * Lightweight LangGraph state for the Summarizer Agent.
 * High-volume payloads (chunks, full DB memory context, user history) are stored
 * in Postgres (`summarizer_memory`, `document_notes`, `document_chunks`).
 * This state carries persistent references (`memoryRefId`, `chunkRefIds`, `noteId`)
 * so memory is optimal and graph traversal consumes minimal runtime RAM.
 */
export const SummarizerState = Annotation.Root({
  documentId: Annotation<string>({
    reducer: (_prev, next) => next,
    default: () => '',
  }),
  userId: Annotation<string>({
    reducer: (_prev, next) => next,
    default: () => '',
  }),
  workspaceId: Annotation<string | null>({
    reducer: (_prev, next) => next,
    default: () => null,
  }),
  format: Annotation<SummarizerFormat>({
    reducer: (_prev, next) => next,
    default: () => 'manual',
  }),
  customFocus: Annotation<string>({
    reducer: (_prev, next) => next,
    default: () => '',
  }),
  includeImages: Annotation<boolean>({
    reducer: (_prev, next) => next,
    default: () => true,
  }),

  // Database references
  memoryRefId: Annotation<string>({
    reducer: (_prev, next) => next,
    default: () => '',
  }),
  noteId: Annotation<string>({
    reducer: (_prev, next) => next,
    default: () => '',
  }),
  chunkRefIds: Annotation<string[]>({
    reducer: (_prev, next) => next,
    default: () => [],
  }),
  outlineRef: Annotation<string>({
    reducer: (_prev, next) => next,
    default: () => '',
  }),

  // Progress & outputs
  title: Annotation<string>({
    reducer: (_prev, next) => next,
    default: () => '',
  }),
  subtitle: Annotation<string>({
    reducer: (_prev, next) => next,
    default: () => '',
  }),
  markdownContent: Annotation<string>({
    reducer: (_prev, next) => next,
    default: () => '',
  }),
  images: Annotation<NoteImage[]>({
    reducer: (prev, next) => [...prev, ...next],
    default: () => [],
  }),
  status: Annotation<string>({
    reducer: (_prev, next) => next,
    default: () => 'init',
  }),
  error: Annotation<string | null>({
    reducer: (_prev, next) => next,
    default: () => null,
  }),
});

export type SummarizerStateType = typeof SummarizerState.State;
