import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { recordToolCall, type AgentToolContext } from './context';
import type { WebSearchResultItem } from '../../prompts/web-search.prompt';

const decodeHtmlEntities = (text: string): string => {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#x2F;/g, '/')
    .replace(/&#x3A;/g, ':')
    .replace(/&nbsp;/g, ' ')
    .replace(/<[^>]+>/g, '')
    .trim();
};

const extractActualUrl = (href: string): string => {
  if (!href) return '';
  try {
    if (href.includes('duckduckgo.com/l/?uddg=')) {
      const urlParam = href.split('uddg=')[1]?.split('&')[0];
      if (urlParam) return decodeURIComponent(urlParam);
    }
    if (href.startsWith('//')) return 'https:' + href;
    return href;
  } catch {
    return href;
  }
};

/**
 * Searches DuckDuckGo for live web information when document retrieval
 * yields no matches.
 */
export const searchDuckDuckGo = async (
  query: string,
  maxResults = 5,
): Promise<WebSearchResultItem[]> => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 6500);

  const results: WebSearchResultItem[] = [];

  try {
    // 1. Try DuckDuckGo HTML endpoint
    const response = await fetch(
      `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`,
      {
        signal: controller.signal,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          Accept:
            'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
        },
      },
    );

    if (response.ok) {
      const html = await response.text();

      // Parse results using regex over result blocks
      const resultBlocks = html.split(/class="result\s+results_links/g).slice(1);

      for (const block of resultBlocks) {
        if (results.length >= maxResults) break;

        const titleMatch = block.match(/<a class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
        const snippetMatch = block.match(/<a class="result__snippet"[^>]*>([\s\S]*?)<\/a>/i);

        if (titleMatch && titleMatch[1] && titleMatch[2]) {
          const rawUrl = titleMatch[1];
          const url = extractActualUrl(rawUrl);
          const title = decodeHtmlEntities(titleMatch[2]);
          const snippet = snippetMatch && snippetMatch[1] ? decodeHtmlEntities(snippetMatch[1]) : '';

          if (title && url && (snippet || title)) {
            results.push({ title, snippet, url });
          }
        }
      }
    }
  } catch {
    // Network or parse issue, fall through to Instant Answer API
  } finally {
    clearTimeout(timeoutId);
  }

  // 2. Fallback to DuckDuckGo Instant Answer API if HTML returned 0 results
  if (!results.length) {
    const apiController = new AbortController();
    const apiTimeout = setTimeout(() => apiController.abort(), 4000);
    try {
      const apiRes = await fetch(
        `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`,
        { signal: apiController.signal },
      );
      if (apiRes.ok) {
        const data = (await apiRes.json()) as any;
        if (data.AbstractText && data.AbstractURL) {
          results.push({
            title: data.Heading || query,
            snippet: data.AbstractText,
            url: data.AbstractURL,
          });
        }
        if (Array.isArray(data.RelatedTopics)) {
          for (const topic of data.RelatedTopics) {
            if (results.length >= maxResults) break;
            if (topic.Text && topic.FirstURL) {
              results.push({
                title: topic.Text.split(' - ')[0] || query,
                snippet: topic.Text,
                url: topic.FirstURL,
              });
            }
          }
        }
      }
    } catch {
      // Best effort fallback
    } finally {
      clearTimeout(apiTimeout);
    }
  }

  return results.slice(0, maxResults);
};

const schema = z.object({
  query: z
    .string()
    .min(1)
    .describe('The search query to execute on DuckDuckGo.'),
  maxResults: z
    .number()
    .int()
    .min(1)
    .max(10)
    .optional()
    .describe('Maximum number of web search results to retrieve.'),
});

export const createWebSearchTool = (ctx: AgentToolContext) =>
  tool(
    async ({ query, maxResults }) =>
      recordToolCall(ctx, 'web_search', { query, maxResults }, async () => {
        const limit = maxResults || 5;
        const results = await searchDuckDuckGo(query, limit);

        ctx.artifacts.webResults = results;

        if (!results.length) {
          return {
            result: 'No web search results could be found for this query.',
            summary: '0 web results from DuckDuckGo',
          };
        }

        const rendered = results
          .map(
            (item, index) =>
              `[W${index + 1}] "${item.title}" (${item.url})\n${item.snippet}`,
          )
          .join('\n\n');

        return {
          result: rendered,
          summary: `${results.length} web results from DuckDuckGo: ${results.map((r) => r.title).join(', ')}`,
        };
      }),
    {
      name: 'web_search',
      description:
        'Searches the public web via DuckDuckGo when document retrieval yields no results or when external context is required.',
      schema,
    },
  );
