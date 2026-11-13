import type { AgentToolContext } from './context.js';
import { createSearchDocumentTool } from './search-document.tool.js';
import { createQueryDatasetTool } from './query-dataset.tool.js';
import { createDocumentOverviewTool } from './document-overview.tool.js';
import { createWebSearchTool } from './web-search.tool.js';
import { createChatHistoryLookupTool } from './chat-history-lookup.tool.js';

export { createToolContext, recordToolCall } from './context.js';
export type { AgentToolContext, ToolCallRecord } from './context.js';
export { searchDuckDuckGo } from './web-search.tool.js';

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
