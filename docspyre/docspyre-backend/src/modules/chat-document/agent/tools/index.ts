import type { AgentToolContext } from './context';
import { createSearchDocumentTool } from './search-document.tool';
import { createQueryDatasetTool } from './query-dataset.tool';
import { createDocumentOverviewTool } from './document-overview.tool';

export { createToolContext, recordToolCall } from './context';
export type { AgentToolContext, ToolCallRecord } from './context';

/**
 * Builds the tool set for one turn. Tools are the single execution path for
 * capability access, so every retrieval, SQL run and summary read is uniformly
 * timed, audited and available to bind to a model.
 */
export const createAgentTools = (ctx: AgentToolContext) => ({
  searchDocument: createSearchDocumentTool(ctx),
  queryDataset: createQueryDatasetTool(ctx),
  documentOverview: createDocumentOverviewTool(ctx),
});

export type AgentTools = ReturnType<typeof createAgentTools>;
