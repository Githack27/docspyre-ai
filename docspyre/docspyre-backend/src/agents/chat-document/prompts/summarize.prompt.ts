import type { ConversationContext } from '../memory/conversation-summary.service';
import { composeSystemPrompt, ANSWER_FORMAT } from './system.prompt';
import { renderConversation } from './document-qa.prompt';

export const DOCUMENT_SUMMARY_SYSTEM = `You write high-precision, factual summaries of documents for an AI retrieval and synthesis system.
Rules:
- Summarize only what the document text directly states. Never invent conclusions or author intent.
- Preserve key metrics, dates, entities, technical terms, and core conclusions.
- Neutral, objective, declarative tone. No marketing or subjective adjectives.
- Return valid JSON matching this exact structure:
{"summary": "<120-220 word executive overview>", "keyPoints": ["<point 1>", "..."], "entities": ["<entity 1>", "..."]}
- keyPoints: 3 to 7 standalone bullet sentences.
- entities: up to 12 major proper nouns, organisations, technologies, or defined terms.`;

export const buildDocumentSummaryPrompt = (input: {
  documentName: string;
  excerpts: string[];
}): string =>
  [
    `Document Name: ${input.documentName}`,
    `## Excerpts\n${input.excerpts.map((text, i) => `--- Excerpt ${i + 1} ---\n${text}`).join('\n\n')}`,
    'JSON:',
  ].join('\n\n');

export const SECTION_SUMMARY_SYSTEM = `You write 1-3 sentence factual summaries of specific document sections for indexing.
Rules:
- Capture the primary concept and key data points of the section.
- Output clean text only without prefixes or JSON formatting.`;

export const buildSectionSummaryPrompt = (input: { heading: string; text: string }): string =>
  [`Section: ${input.heading || '(untitled)'}`, `Text:\n${input.text}`, 'Summary:'].join('\n\n');

export const buildSummarizeAnswerPrompt = (input: {
  question: string;
  documentSummary: string | null;
  keyPoints: string[];
  sectionSummaries: { heading: string; summary: string }[];
  conversation: ConversationContext;
  persona?: string | null;
  workspacePersona?: string | null;
}): { system: string; user: string } => {
  const system = composeSystemPrompt(
    [
      `## Task: Executive Summary\nYou are synthesizing a comprehensive, readable summary of the document using pre-computed summaries and key findings. Be structured, concise, and highlight main takeaways.`,
      ANSWER_FORMAT,
    ],
    input.persona,
    input.workspacePersona,
  );

  const sections = input.sectionSummaries.length
    ? input.sectionSummaries.map((s) => `- **${s.heading}**: ${s.summary}`).join('\n')
    : '';

  const user = [
    input.documentSummary ? `## Overall Document Summary\n${input.documentSummary}` : '',
    input.keyPoints.length ? `## Core Takeaways\n${input.keyPoints.map((p) => `- ${p}`).join('\n')}` : '',
    sections ? `## Section Overviews\n${sections}` : '',
    renderConversation(input.conversation),
    `## User Request\n${input.question}`,
  ]
    .filter(Boolean)
    .join('\n\n');

  return { system, user };
};
