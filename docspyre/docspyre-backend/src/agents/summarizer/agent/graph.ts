import { StateGraph, START, END } from '@langchain/langgraph';
import { SummarizerState } from './state';
import type { SummarizerRuntime } from './runtime';
import { initMemoryNode } from './nodes/init-memory.node';
import { planOutlineNode } from './nodes/plan-outline.node';
import { draftManualNode } from './nodes/draft-manual.node';
import { visualsNode } from './nodes/visuals.node';
import { finalizeNotesNode } from './nodes/finalize-notes.node';

const N = {
  initMemory: 'n_init_memory',
  planOutline: 'n_plan_outline',
  draftManual: 'n_draft_manual',
  visuals: 'n_visuals',
  finalizeNotes: 'n_finalize_notes',
} as const;

export const buildSummarizerGraph = (runtime: SummarizerRuntime) => {
  const graph = new StateGraph(SummarizerState)
    .addNode(N.initMemory, initMemoryNode(runtime))
    .addNode(N.planOutline, planOutlineNode(runtime))
    .addNode(N.draftManual, draftManualNode(runtime))
    .addNode(N.visuals, visualsNode(runtime))
    .addNode(N.finalizeNotes, finalizeNotesNode(runtime));

  graph.addEdge(START, N.initMemory);
  graph.addEdge(N.initMemory, N.planOutline);
  graph.addEdge(N.planOutline, N.draftManual);
  graph.addEdge(N.draftManual, N.visuals);
  graph.addEdge(N.visuals, N.finalizeNotes);
  graph.addEdge(N.finalizeNotes, END);

  return graph.compile();
};

export type SummarizerGraph = ReturnType<typeof buildSummarizerGraph>;
