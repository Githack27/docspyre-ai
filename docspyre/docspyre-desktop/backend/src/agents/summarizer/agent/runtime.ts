import type { ResolvedProvider } from '../../chat-document/llm/provider-resolver.service.js';
import type { NoteImage, OutlineData } from './state.js';

export type SummarizerStreamEvent =
  | { type: 'status'; phase: string; message: string }
  | { type: 'token'; token: string }
  | { type: 'outline'; data: OutlineData }
  | { type: 'visual'; image: NoteImage }
  | { type: 'done'; note: unknown }
  | { type: 'error'; message: string };

export interface SummarizerRuntime {
  provider: ResolvedProvider | null;
  emit: (event: SummarizerStreamEvent) => void;
}
