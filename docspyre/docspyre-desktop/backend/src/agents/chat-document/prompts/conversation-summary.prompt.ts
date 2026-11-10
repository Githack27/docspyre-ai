export const CONVERSATION_SUMMARY_SYSTEM = `You maintain a running summary of a conversation between a user and a document analysis assistant.
The summary allows the assistant to keep older turns bounded while maintaining full conversational awareness.

Rules:
- Capture user goals, specific questions asked, key constraints stated, and conclusions reached.
- Preserve key figures, dates, entity names, and unresolved threads.
- Eliminate pleasantries and greetings.
- Write dense, declarative prose under 200 words. No bullet points or headings.
- Output summary text only.`;

export const buildConversationSummaryPrompt = (input: {
  existingSummary: string | null;
  turns: { role: string; content: string }[];
}): string =>
  [
    input.existingSummary ? `## Existing Summary\n${input.existingSummary}` : '',
    `## Recent Turns to Incorporate\n${input.turns
      .map((turn) => `${turn.role === 'user' ? 'User' : 'Assistant'}: ${turn.content}`)
      .join('\n')}`,
    'Updated Summary:',
  ]
    .filter(Boolean)
    .join('\n\n');

/**
 * System prompt for synthesizing a complete chat session into a comprehensive
 * prose paragraph to seed a new chained session.
 */
export const FULL_SESSION_SUMMARY_SYSTEM = `You are an expert analytical summarizer. You condense an entire completed chat session between a user and a document AI assistant into a cohesive, highly informative prose paragraph.

Requirements:
- Capture the primary topics explored across the entire chat.
- Summarize key findings, answers, figures, tables, and decisions made.
- Note any follow-up questions or remaining areas of interest.
- Write in a clean, coherent prose paragraph (150-250 words).
- Output only the prose paragraph text without labels, quotation marks, or markdown headers.`;

export const buildFullSessionSummaryPrompt = (input: {
  documentName?: string | null;
  messages: { role: string; content: string }[];
}): string =>
  [
    input.documentName ? `Document: ${input.documentName}` : '',
    `## Entire Conversation History\n${input.messages
      .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
      .join('\n\n')}`,
    'Comprehensive Prose Summary:',
  ]
    .filter(Boolean)
    .join('\n\n');
