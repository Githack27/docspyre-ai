import type { RetrievedChunk } from '../retrieval/retriever.service';
import type { ConversationContext } from '../memory/conversation-summary.service';
import { composeSystemPrompt, ANSWER_FORMAT, CITATION_RULES } from './system.prompt';

export const renderChunks = (chunks: RetrievedChunk[]): string => {
  if (!chunks.length) {
    return 'None. No excerpts matched this question.';
  }

  return chunks
    .map((chunk, index) => {
      const section = chunk.section_path?.filter(Boolean).join(' > ');
      const label = section ? ` — ${section}` : '';
      return `[${index + 1}] (page ${chunk.page}${label})\n${chunk.parent_text || chunk.text}`;
    })
    .join('\n\n');
};

export const renderConversation = (context: ConversationContext): string => {
  const blocks: string[] = [];

  if (context.initialSummary) {
    blocks.push(
      `### Previous Chat Session Summary (Full History Context)\n${context.initialSummary}`,
    );
  }

  if (context.summary) {
    blocks.push(`### Earlier Discussion in Current Session (Summarized)\n${context.summary}`);
  }

  if (context.recentTurns?.length) {
    const turns = context.recentTurns
      .map((turn) => `${turn.role === 'user' ? 'User' : 'Assistant'}: ${turn.content}`)
      .join('\n');
    blocks.push(`### Recent Chat Messages\n${turns}`);
  }

  if (!blocks.length) return '';

  return `## Prior Conversation History\nUse this context to resolve conversational references (such as "it", "the previous result", or follow-up clarifications). Factual answers must still be supported by the context sources.\n${blocks.join('\n\n')}`;
};

export const buildDocumentQaPrompt = (input: {
  question: string;
  chunks: RetrievedChunk[];
  documentSummary?: string | null;
  conversation: ConversationContext;
  persona?: string | null;
  workspacePersona?: string | null;
}): { system: string; user: string } => {
  const system = composeSystemPrompt(
    [CITATION_RULES, ANSWER_FORMAT],
    input.persona,
    input.workspacePersona,
  );

  const user = [
    input.documentSummary
      ? `## Document Overview & Synopsis\nBackground context only — do not cite this section.\n${input.documentSummary}`
      : '',
    `## Grounding Document Excerpts\n${renderChunks(input.chunks)}`,
    renderConversation(input.conversation),
    `## User Question\n${input.question}`,
  ]
    .filter(Boolean)
    .join('\n\n');

  return { system, user };
};
