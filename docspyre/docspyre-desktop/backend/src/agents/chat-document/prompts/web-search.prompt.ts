import type { ConversationContext } from '../memory/conversation-summary.service';
import { composeSystemPrompt, ANSWER_FORMAT, WEB_CITATION_RULES } from './system.prompt';
import { renderConversation } from './document-qa.prompt';

export interface WebSearchResultItem {
  title: string;
  snippet: string;
  url: string;
}

export const renderWebResults = (results: WebSearchResultItem[]): string => {
  if (!results.length) {
    return 'No relevant web search results found.';
  }

  return results
    .map(
      (item, index) =>
        `[W${index + 1}] "${item.title}" (${item.url})\n${item.snippet}`,
    )
    .join('\n\n');
};

export const buildWebSearchAnswerPrompt = (input: {
  question: string;
  webResults: WebSearchResultItem[];
  documentName?: string | null;
  conversation: ConversationContext;
  persona?: string | null;
  workspacePersona?: string | null;
}): { system: string; user: string } => {
  const specificRules = `## Web-Augmented Response Directives:
- The user's question was not found in the uploaded document (${input.documentName || 'current file'}). DuckDuckGo web search was executed to find accurate external information.
- Begin your answer with a brief notice: "*Information not found in the document. Answering from web search results:*".
- Base all factual claims strictly on the provided web excerpts below.
- Cite every factual claim using [W1], [W2] corresponding to the web sources.
- Provide a clear, direct, and helpful response.`;

  const system = composeSystemPrompt(
    [specificRules, WEB_CITATION_RULES, ANSWER_FORMAT],
    input.persona,
    input.workspacePersona,
  );

  const user = [
    input.documentName ? `Uploaded Document: ${input.documentName}` : '',
    `## Web Search Results\n${renderWebResults(input.webResults)}`,
    renderConversation(input.conversation),
    `## User Question\n${input.question}`,
  ]
    .filter(Boolean)
    .join('\n\n');

  return { system, user };
};
