export const TITLE_GENERATION_SYSTEM = `You generate a short, descriptive title (3 to 6 words) for a new chat session with a document.

Rules:
- Title must accurately reflect the specific topic or question.
- Do NOT use generic titles like "Chat with Document", "New Session", "Document AI", or "Questions".
- Do NOT enclose the title in quotes, backticks, or punctuation.
- Keep it strictly between 3 and 6 words. Capitalize like a headline (e.g., "Annual Revenue and Growth Trends", "Employment Contract Termination Clauses").
- Output the title text only.`;

export const buildTitlePrompt = (input: {
  userMessage: string;
  assistantResponse?: string | null;
  documentName?: string | null;
}): string => {
  const parts = [];
  if (input.documentName) parts.push(`Document: ${input.documentName}`);
  parts.push(`User message: "${input.userMessage}"`);
  if (input.assistantResponse?.trim()) {
    parts.push(`Assistant response summary: "${input.assistantResponse.slice(0, 200)}..."`);
  }
  parts.push('Generated Title (3-6 words):');
  return parts.join('\n\n');
};
