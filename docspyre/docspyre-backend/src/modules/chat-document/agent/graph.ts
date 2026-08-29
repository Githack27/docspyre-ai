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
 * Builds the chat-with-document agent.
 *
 * Shape:
 *
 *   START → route ─┬→ smalltalk ─────────────────────────────→ END
 *                  ├→ summarize ─┬→ (has summary) ──────────→ END
 *                  │             └→ (no summary) → answer → verify → END
 *                  ├→ retrieve → answer → verify ────────────→ END
 *                  └→ generate_sql → execute_sql ─┬→ (retry) → generate_sql
 *                                                 └→ dataset_answer → END
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
    .addNode('route', routeNode(runtime))
    .addNode('retrieve', retrieveNode(runtime))
    .addNode('answer', answerNode(runtime))
    .addNode('summarize', summarizeNode(runtime))
    .addNode('generate_sql', generateSqlNode(runtime))
    .addNode('execute_sql', executeSqlNode(runtime))
    .addNode('dataset_answer', datasetAnswerNode(runtime))
    .addNode('smalltalk', smalltalkNode(runtime))
    .addNode('verify', verifyNode(runtime));

  graph.addEdge(START, 'route');

  graph.addConditionalEdges(
    'route',
    (state: AgentStateType) => state.route,
    {
      document_qa: 'retrieve',
      dataset_query: 'generate_sql',
      summarize: 'summarize',
      smalltalk: 'smalltalk',
    },
  );

  // Document QA: retrieve, answer, then audit the answer against the excerpts.
  graph.addEdge('retrieve', 'answer');
  graph.addEdge('answer', 'verify');
  graph.addEdge('verify', END);

  // Summary branch answers from stored summaries. If none exist it degrades to
  // the retrieval path rather than returning nothing.
  graph.addConditionalEdges(
    'summarize',
    (state: AgentStateType) => (state.answer ? 'done' : 'fallback'),
    { done: END, fallback: 'answer' },
  );

  // Dataset branch: generate, execute, repair on failure, then report.
  graph.addConditionalEdges(
    'generate_sql',
    (state: AgentStateType) => (state.answer ? 'abort' : 'execute'),
    { execute: 'execute_sql', abort: END },
  );

  graph.addConditionalEdges(
    'execute_sql',
    (state: AgentStateType) => (shouldRetrySql(state) ? 'retry' : 'report'),
    { retry: 'generate_sql', report: 'dataset_answer' },
  );

  graph.addEdge('dataset_answer', END);
  graph.addEdge('smalltalk', END);

  return graph.compile();
};

export type AgentGraph = ReturnType<typeof buildAgentGraph>;
