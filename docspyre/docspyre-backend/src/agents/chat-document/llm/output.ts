import type { BaseMessage } from '@langchain/core/messages';

/**
 * Flattens a chat model response into plain text. LangChain messages carry
 * either a string or an array of content parts depending on the provider, so
 * every call site funnels through here.
 */
export const messageText = (message: BaseMessage | { content: unknown }): string => {
  const content = (message as { content: unknown }).content;

  if (typeof content === 'string') return content;

  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string') return part;
        if (part && typeof part === 'object' && 'text' in part) {
          const text = (part as { text?: unknown }).text;
          return typeof text === 'string' ? text : '';
        }
        return '';
      })
      .join('');
  }

  return '';
};

/**
 * Extracts the first JSON object or array from model output, tolerating
 * markdown fences and surrounding prose. Returns null instead of throwing so
 * callers can fall back to a deterministic path.
 */
export const extractJson = <T>(raw: string): T | null => {
  if (!raw) return null;

  let text = raw.trim();

  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenced?.[1]) text = fenced[1].trim();

  const direct = tryParse<T>(text);
  if (direct !== null) return direct;

  // Fall back to the outermost balanced object/array in the string.
  const start = text.search(/[{[]/);
  if (start === -1) return null;

  const opening = text[start];
  const closing = opening === '{' ? '}' : ']';
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < text.length; i += 1) {
    const char = text[i];

    if (inString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }

    if (char === '"') inString = true;
    else if (char === opening) depth += 1;
    else if (char === closing) {
      depth -= 1;
      if (depth === 0) return tryParse<T>(text.slice(start, i + 1));
    }
  }

  return null;
};

const tryParse = <T>(text: string): T | null => {
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
};

/** Strips markdown fences from a model-authored code block (used for SQL). */
export const unfence = (raw: string): string => {
  const text = raw.trim();
  const fenced = text.match(/^```(?:\w+)?\s*([\s\S]*?)\s*```$/);
  return (fenced?.[1] ?? text).trim();
};
