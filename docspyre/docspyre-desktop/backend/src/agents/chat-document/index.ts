// Public surface of the chat-with-document module.
// Internals (agent graph, nodes, prompts, tools, DuckDB sandbox) stay private so
// the module can be reworked without touching call sites.

export { chatDocumentController } from './chat-document.controller.js';
export { chatDocumentService, CONTEXT_USAGE_LIMIT_TOKENS } from './chat-document.service.js';
export type { TurnResult } from './chat-document.service.js';

// Ingestion is driven by the documents module.
export { ingestionQueue } from './ingestion/queue.service.js';
export type { IngestionJob } from './ingestion/queue.service.js';

// Dataset detection is needed to describe an upload to clients.
export { datasetService } from './data/dataset.service.js';
export type { DatasetSchema } from './data/dataset.service.js';

// Stored summaries are useful outside chat (previews, listings).
export { summarizerService } from './ingestion/summarizer.service.js';

export type { Citation, ClaimVerification } from './agent/state.js';
export { searchDuckDuckGo } from './agent/tools/web-search.tool.js';

