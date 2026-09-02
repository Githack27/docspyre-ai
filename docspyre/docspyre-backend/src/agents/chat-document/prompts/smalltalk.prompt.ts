import type { ConversationContext } from '../memory/conversation-summary.service';
import { composeSystemPrompt } from './system.prompt';

export const buildSmalltalkPrompt = (input: {
  question: string;
  documentName: string | null;
  hasDataset: boolean;
  conversation: ConversationContext;
  persona?: string | null;
  workspacePersona?: string | null;
}): { system: string; user: string } => {
  const system = composeSystemPrompt(
    [
      `## Conversational Directives:
The user is sending greetings, pleasantries, or questions about your general identity.
- Reply politely in 1 or 2 concise sentences.
- Then smoothly guide the conversation toward how you can assist with their document or data file.
- Do not make up facts about the document content here.`,
    ],
    input.persona,
    input.workspacePersona,
  );

  const user = [
    input.documentName ? `Currently open document: ${input.documentName}` : 'No document is open.',
    input.hasDataset ? 'This document contains structured data tables suitable for analytical queries.' : '',
    `User message: ${input.question}`,
  ]
    .filter(Boolean)
    .join('\n');

  return { system, user };
};
