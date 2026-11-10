import { StateGraph, START, END } from '@langchain/langgraph';
import { AgentState, type AgentStateType } from './state';
import type { AgentRuntime } from './runtime';
import { routeNode } from './nodes/route.node';
import { retrieveNode } from './nodes/retrieve.node';
import { answerNode } from './nodes/answer.node';
import { summarizeNode } from './nodes/summarize.node';
import { generateSqlNode, executeSqlNode, shouldRetrySql } from './nodes/dataset.node';
import { datasetAnswerNode } from './nodes/dataset-answer.node';
import { smalltalkNode } from './nodes/smalltalk.node';
import { verifyNode } from './nodes/verify.node';

/**
 * Node identifiers.
 *
 * LangGraph forbids a node name that matches a state channel name, so every
 * node is namespaced with an `n_` prefix. This keeps node identifiers disjoint
 * from state fields (route, answer, verification, ...) no matter how the state
 * shape evolves.
 */
const N = {
  router: 'n_router',
  retrieve: 'n_retrieve',
  answer: 'n_answer',
  summarize: 'n_summarize',
  generateSql: 'n_generate_sql',
  executeSql: 'n_execute_sql',
  datasetAnswer: 'n_dataset_answer',
  smalltalk: 'n_smalltalk',
  verify: 'n_verify',
} as const;

/**
 * Builds the chat-with-document agent.
 *
 * Shape:
 *
 *   START → router ─┬→ smalltalk ────────────────────────────→ END
 *                   ├→ summarize ─┬→ (has summary) ──────────→ END
 *                   │             └→ (no summary) → answer → verify → END
 *                   ├→ retrieve → answer → verify ───────────→ END
 *                   └→ generate_sql → execute_sql ─┬→ (retry) → generate_sql
 *                                                  └→ dataset_answer → END
 *
 * Branch selection is deterministic once the router has classified the turn,
 * which keeps latency and cost predictable. The only loop is SQL repair, and it
 * is bounded by AGENT_SQL_MAX_ATTEMPTS.
 *
 * The graph is constructed per request so nodes can close over the runtime
 * (tools, provider, emitter) instead of threading it through config.
 */
export const buildAgentGraph = (runtime: AgentRuntime) => {
  const graph = new StateGraph(AgentState)
    .addNode(N.router, routeNode(runtime))
    .addNode(N.retrieve, retrieveNode(runtime))
    .addNode(N.answer, answerNode(runtime))
    .addNode(N.summarize, summarizeNode(runtime))
    .addNode(N.generateSql, generateSqlNode(runtime))
    .addNode(N.executeSql, executeSqlNode(runtime))
    .addNode(N.datasetAnswer, datasetAnswerNode(runtime))
    .addNode(N.smalltalk, smalltalkNode(runtime))
    .addNode(N.verify, verifyNode(runtime));

  graph.addEdge(START, N.router);

  graph.addConditionalEdges(
    N.router,
    (state: AgentStateType) => state.route,
    {
      document_qa: N.retrieve,
      dataset_query: N.generateSql,
      summarize: N.summarize,
      smalltalk: N.smalltalk,
    },
  );

  // Document QA: retrieve, answer, then audit the answer against the excerpts.
  graph.addEdge(N.retrieve, N.answer);
  graph.addEdge(N.answer, N.verify);
  graph.addEdge(N.verify, END);

  // Summary branch answers from stored summaries. If none exist it degrades to
  // the retrieval path rather than returning nothing.
  graph.addConditionalEdges(
    N.summarize,
    (state: AgentStateType) => (state.answer ? 'done' : 'fallback'),
    { done: END, fallback: N.answer },
  );

  // Dataset branch: generate, execute, repair on failure, then report.
  graph.addConditionalEdges(
    N.generateSql,
    (state: AgentStateType) => (state.answer ? 'abort' : 'execute'),
    { execute: N.executeSql, abort: END },
  );

  graph.addConditionalEdges(
    N.executeSql,
    (state: AgentStateType) => (shouldRetrySql(state) ? 'retry' : 'report'),
    { retry: N.generateSql, report: N.datasetAnswer },
  );

  graph.addEdge(N.datasetAnswer, END);
  graph.addEdge(N.smalltalk, END);

  return graph.compile();
};

export type AgentGraph = ReturnType<typeof buildAgentGraph>;
