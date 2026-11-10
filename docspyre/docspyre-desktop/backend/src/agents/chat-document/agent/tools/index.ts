import type { AgentToolContext } from './context';
import { createSearchDocumentTool } from './search-document.tool';
import { createQueryDatasetTool } from './query-dataset.tool';
import { createDocumentOverviewTool } from './document-overview.tool';
import { createWebSearchTool } from './web-search.tool';
import { createChatHistoryLookupTool } from './chat-history-lookup.tool';

export { createToolContext, recordToolCall } from './context';
export type { AgentToolContext, ToolCallRecord } from './context';
export { searchDuckDuckGo } from './web-search.tool';

/**
 * Builds the tool set for one turn. Tools are the single execution path for
 * capability access, so every retrieval, SQL run, web search and summary read is uniformly
 * timed, audited and available to bind to a model.
 */
export const createAgentTools = (ctx: AgentToolContext) => ({
  searchDocument: createSearchDocumentTool(ctx),
  queryDataset: createQueryDatasetTool(ctx),
  documentOverview: createDocumentOverviewTool(ctx),
  webSearch: createWebSearchTool(ctx),
  lookupPreviousChatHistory: createChatHistoryLookupTool(ctx),
});

export type AgentTools = ReturnType<typeof createAgentTools>;
