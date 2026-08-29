import { createChatModel } from '../../llm/model.factory';
import { messageText } from '../../llm/output';
import { logger } from '../../../../core/utils/logger';
import { ROUTER_SYSTEM, buildRouterPrompt, type AgentRoute } from '../prompts';
import type { AgentRuntime } from '../runtime';
import type { AgentStateType, AgentStateUpdate } from '../state';

const ROUTES: readonly AgentRoute[] = ['document_qa', 'dataset_query', 'summarize', 'smalltalk'];

const SUMMARY_HINTS = [
  'summarize', 'summarise', 'summary', 'overview', 'tl;dr', 'tldr',
  'what is this about', 'what does this document', 'key points', 'main points',
  'abstract', 'gist',
];

const AGGREGATE_HINTS = [
  'how many', 'how much', 'total', 'sum', 'average', 'avg', 'mean', 'median',
  'count', 'maximum', 'minimum', 'max ', 'min ', 'highest', 'lowest', 'top ',
  'group by', 'per ', 'trend', 'distribution', 'percentage', 'percent',
  'greater than', 'less than', 'between', 'sort', 'rank', 'breakdown',
];

const SMALLTALK_PATTERN =
  /^\s*(hi|hello|hey|yo|good (morning|afternoon|evening)|thanks|thank you|thx|ok|okay|cool|nice|who are you|what can you do|what are you|help)\b/i;

/** Deterministic classifier used as a prior and as the fallback. */
const heuristicRoute = (question: string, hasDataset: boolean): AgentRoute => {
  const text = question.toLowerCase().trim();

  if (SMALLTALK_PATTERN.test(text) && text.length < 60) return 'smalltalk';
  if (SUMMARY_HINTS.some((hint) => text.includes(hint))) return 'summarize';
  if (hasDataset && AGGREGATE_HINTS.some((hint) => text.includes(hint))) return 'dataset_query';

  return 'document_qa';
};

/**
 * Picks the branch for this turn. The model decides, with a heuristic prior as
 * fallback, and the result is clamped so a dataset route can never be selected
 * for a file that has no tables.
 */
export const routeNode = (runtime: AgentRuntime) =>
  async (state: AgentStateType): Promise<AgentStateUpdate> => {
    const hasDataset = runtime.ctx.datasetSources.length > 0;
    const fallback = heuristicRoute(state.question, hasDataset);

    let route = fallback;

    if (runtime.provider) {
      try {
        const model = createChatModel(runtime.provider, { temperature: 0, maxTokens: 16 });
        const response = await model.invoke([
          { role: 'system', content: ROUTER_SYSTEM },
          {
            role: 'user',
            content: buildRouterPrompt(
              state.question,
              hasDataset,
              runtime.ctx.datasetSchemas.map((schema) => schema.tableName),
            ),
          },
        ]);

        const label = messageText(response).trim().toLowerCase().replace(/['".]/g, '');
        if (ROUTES.includes(label as AgentRoute)) route = label as AgentRoute;
      } catch (error) {
        logger.debug('Router model failed, using heuristic', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // Clamp impossible routes.
    if (route === 'dataset_query' && !hasDataset) route = 'document_qa';

    runtime.emit({ type: 'route', route });
    return { route };
  };
