import type { Response } from 'express';
import type { RetrievedChunk } from './retriever.service';
import type { ResolvedProvider } from './provider-resolver.service';
import { logger } from '../../utils/logger';

/** Used when a config has no model set. */
const DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash';

/**
 * Concatenates the visible text from a Gemini `content.parts` array.
 *
 * Thinking models (Gemini 2.5/3.x) interleave reasoning parts, flagged with
 * `thought: true`, among the answer parts. Reading only `parts[0].text` can
 * therefore yield an empty string even on a successful response, so every
 * non-thought part is collected instead.
 */
function extractGeminiText(parts: unknown): string {
  if (!Array.isArray(parts)) return '';
  let out = '';
  for (const part of parts) {
    if (!part || typeof part !== 'object') continue;
    const p = part as { thought?: boolean; text?: unknown };
    if (p.thought) continue;
    if (typeof p.text === 'string') out += p.text;
  }
  return out;
}

export interface Citation {
  index: number;
  chunk_id: string;
  document_id: string;
  page: number;
  bbox: number[];
  section_path: string[];
}

/** Where the answer text came from. `fallback` means the offline mock ran. */
export type GenerationSource = 'provider' | 'ollama' | 'fallback';

export interface GenerationResult {
  text: string;
  citations: Citation[];
  source: GenerationSource;
}

/** A prior turn in the conversation, oldest first. */
export interface HistoryTurn {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * Behavioural contract for the document agent. Kept as a named constant so the
 * rules are reviewable in one place and identical across every provider.
 */
const AGENT_INSTRUCTIONS = `You are Docspyre AI, a document analysis assistant. You answer questions strictly about the document excerpts supplied to you.

## Grounding rules
- Answer ONLY from the numbered context sources below. Never use outside knowledge, and never invent facts, figures, names or dates.
- Attach a citation marker to every factual claim, using the source's number in square brackets: [1], [2]. Multiple sources: [1][3]. Never write "[source 1]" or "(1)".
- If the sources do not contain the answer, say so plainly and state what is missing. Do not guess or fill gaps.
- If the sources only partially cover the question, answer the covered part and explicitly name what is not covered.

## Asking instead of guessing
- If the question is ambiguous, refers to something not present in the sources, or could reasonably mean more than one thing, ask a short clarifying question rather than answering speculatively.
- Prefer one focused question over several. Where useful, offer the concrete options you can see in the document.
- For greetings or small talk, reply briefly and invite a question about the document. Do not fabricate a summary.

## Answer format (Markdown)
- Reply in Markdown. Use **bold** for key terms, bullet lists for enumerations, and \`code\` for identifiers, field names and values.
- Use a Markdown table when comparing items across the same attributes.
- Use \`###\` subheadings only when the answer has several distinct parts.
- Be concise and lead with the answer; add supporting detail after. No preamble such as "Certainly" or "Based on the context".`;

export const generatorService = {
  /**
   * Classifies the query intent using the configured provider or local heuristics.
   */
  async classifyIntent(query: string, provider?: ResolvedProvider | null): Promise<'single_doc_qa' | 'cross_doc_synthesis' | 'summarization' | 'out_of_scope'> {
    const qLower = query.toLowerCase();

    // Heuristics fallback
    const isSummarize = qLower.includes('summarize') || qLower.includes('summary') || qLower.includes('overview') || qLower.includes('tl;dr');
    const isGreetingOrChat = qLower.match(/^(hello|hi|hey|good morning|good afternoon|how are you|who are you|what is your name)/);

    let localIntent: 'single_doc_qa' | 'cross_doc_synthesis' | 'summarization' | 'out_of_scope' = 'single_doc_qa';
    if (isSummarize) localIntent = 'summarization';
    else if (isGreetingOrChat) localIntent = 'out_of_scope';
    else if (qLower.includes('compare') || qLower.includes('across') || qLower.includes('all files') || qLower.includes('these documents')) {
      localIntent = 'cross_doc_synthesis';
    }

    if (!provider) return localIntent;

    const classificationPrompt = `Classify the following query into exactly one of these labels: 'single_doc_qa', 'cross_doc_synthesis', 'summarization', 'out_of_scope'.\nRespond ONLY with the label name, no explanations.\n\nQuery: "${query}"`;

    try {
      const text = await this.callProvider(provider, classificationPrompt, 0.1);
      if (text) {
        const label = text.trim().toLowerCase().replace(/['"]/g, '');
        if (['single_doc_qa', 'cross_doc_synthesis', 'summarization', 'out_of_scope'].includes(label)) {
          return label as any;
        }
      }
    } catch {
      // Fall back to heuristics
    }

    return localIntent;
  },

  /**
   * Assembles the full prompt: agent rules, numbered context, recent turns and
   * the current question. A provider-specific system prompt, when configured in
   * the UI, replaces the default persona but the grounding/format rules are
   * always appended so behaviour stays consistent.
   */
  buildPrompt(
    query: string,
    context: RetrievedChunk[],
    provider?: ResolvedProvider | null,
    history: HistoryTurn[] = []
  ): string {
    const instructions = provider?.systemPrompt?.trim()
      ? `${provider.systemPrompt.trim()}\n\n${AGENT_INSTRUCTIONS}`
      : AGENT_INSTRUCTIONS;

    const sources = context.length
      ? context
          .map((c, idx) => {
            const section = c.section_path?.filter(Boolean).join(' > ');
            const label = section ? ` — ${section}` : '';
            return `[${idx + 1}] (page ${c.page}${label})\n${c.parent_text || c.text}`;
          })
          .join('\n\n')
      : 'None. No excerpt of this document matched the question.';

    const priorTurns = history.length
      ? history
          .map((t) => `${t.role === 'user' ? 'User' : 'Assistant'}: ${t.content}`)
          .join('\n')
      : '';

    return [
      instructions,
      `## Context sources\n${sources}`,
      priorTurns
        ? `## Conversation so far\nUse this only to resolve references such as "it" or "why". Facts must still come from the context sources.\n${priorTurns}`
        : '',
      `## Current question\n${query}`,
    ]
      .filter(Boolean)
      .join('\n\n');
  },

  /**
   * Main entrypoint to stream answers via SSE (Server-Sent Events).
   */
  async streamResponse(
    query: string,
    intent: string,
    context: RetrievedChunk[],
    res: Response,
    provider?: ResolvedProvider | null,
    history: HistoryTurn[] = []
  ): Promise<GenerationResult> {
    const citations: Citation[] = context.map((c, idx) => ({
      index: idx + 1,
      chunk_id: c.chunk_id,
      document_id: c.document_id,
      page: c.page,
      bbox: c.bbox,
      section_path: c.section_path
    }));

    // Setup Server-Sent Events headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const systemPrompt = this.buildPrompt(query, context, provider, history);

    let generatedText = '';
    const temperature = intent === 'cross_doc_synthesis' ? 0.3 : 0.1;

    if (provider) {
      try {
        generatedText = await this.streamFromProvider(provider, systemPrompt, temperature, res);
        if (generatedText.trim().length > 0) {
          return { text: generatedText, citations, source: 'provider' };
        }
      } catch {
        // Provider failed, try Ollama fallback
      }
    }

    // Fallback: Try Local Ollama Streaming
    try {
      generatedText = await this.streamFromOllama(systemPrompt, res);
      if (generatedText.trim().length > 0) {
        return { text: generatedText, citations, source: 'ollama' };
      }
    } catch {
      // Ollama not available
    }

    // Final Fallback: offline mock generation. This is a degraded response and
    // must never be persisted to the semantic cache, otherwise it gets replayed
    // for every future identical query even after the real pipeline is healthy.
    generatedText = this.generateOfflineMock(intent, context);

    const tokens = generatedText.split(/(\s+)/);
    for (const token of tokens) {
      if (!token) continue;
      res.write(`data: ${JSON.stringify({ token })}\n\n`);
      await new Promise(resolve => setTimeout(resolve, 30));
    }

    return { text: generatedText, citations, source: 'fallback' };
  },

  /**
   * Calls the configured provider for a non-streaming text response (used for classification/verification).
   */
  async callProvider(provider: ResolvedProvider, prompt: string, temperature = 0.1): Promise<string | null> {
    switch (provider.providerId) {
      case 'gemini':
        return this.callGemini(provider.apiKey, provider.model, prompt, temperature);
      case 'openai':
        return this.callOpenAI(provider.apiKey, provider.model, prompt, temperature);
      case 'anthropic':
        return this.callAnthropic(provider.apiKey, provider.model, prompt, temperature);
      case 'cohere':
        return this.callCohere(provider.apiKey, provider.model, prompt, temperature);
      case 'ollama':
        return this.callOllamaSync(provider.model, prompt, temperature);
      default:
        return null;
    }
  },

  /**
   * Streams a response from the configured provider to the SSE connection.
   */
  async streamFromProvider(provider: ResolvedProvider, prompt: string, temperature: number, res: Response): Promise<string> {
    switch (provider.providerId) {
      case 'gemini':
        return this.streamGemini(provider.apiKey, provider.model, prompt, temperature, res);
      case 'openai':
        return this.streamOpenAI(provider.apiKey, provider.model, prompt, temperature, res);
      case 'anthropic':
        return this.streamAnthropic(provider.apiKey, provider.model, prompt, temperature, res);
      case 'cohere':
        return this.streamCohere(provider.apiKey, provider.model, prompt, temperature, res);
      case 'ollama':
        return this.streamFromOllama(prompt, res, provider.model);
      default:
        return '';
    }
  },

  // ---------------------------------------------------------------------------
  // Gemini
  // ---------------------------------------------------------------------------

  async callGemini(apiKey: string, model: string, prompt: string, temperature: number): Promise<string | null> {
    const modelName = model || DEFAULT_GEMINI_MODEL;
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature }
        })
      }
    );
    if (!response.ok) {
      logger.warn('Gemini generateContent failed', {
        model: modelName,
        status: response.status,
        body: (await response.text()).slice(0, 300),
      });
      return null;
    }
    const json: any = await response.json();
    return extractGeminiText(json.candidates?.[0]?.content?.parts) || null;
  },

  async streamGemini(apiKey: string, model: string, prompt: string, temperature: number, res: Response): Promise<string> {
    const modelName = model || DEFAULT_GEMINI_MODEL;

    // `alt=sse` is required. Without it this endpoint returns a single
    // pretty-printed JSON array rather than an event stream, which cannot be
    // parsed incrementally line-by-line.
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:streamGenerateContent?alt=sse&key=${apiKey}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { temperature }
      })
    });

    if (!response.ok || !response.body) {
      logger.warn('Gemini streamGenerateContent failed', {
        model: modelName,
        status: response.status,
        body: response.body ? (await response.text()).slice(0, 300) : '<no body>',
      });
      return '';
    }

    let generatedText = '';
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        const payload = trimmed.slice(5).trim();
        if (!payload || payload === '[DONE]') continue;

        try {
          const parsed = JSON.parse(payload);
          const textChunk = extractGeminiText(parsed.candidates?.[0]?.content?.parts);
          if (textChunk) {
            generatedText += textChunk;
            res.write(`data: ${JSON.stringify({ token: textChunk })}\n\n`);
          }
        } catch {
          // Partial JSON across chunk boundary — the buffer will retry it.
        }
      }
    }

    return generatedText;
  },

  // ---------------------------------------------------------------------------
  // OpenAI
  // ---------------------------------------------------------------------------

  async callOpenAI(apiKey: string, model: string, prompt: string, temperature: number): Promise<string | null> {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: model || 'gpt-4o',
        messages: [{ role: 'user', content: prompt }],
        temperature,
      })
    });
    if (!response.ok) return null;
    const json: any = await response.json();
    return json.choices?.[0]?.message?.content || null;
  },

  async streamOpenAI(apiKey: string, model: string, prompt: string, temperature: number, res: Response): Promise<string> {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: model || 'gpt-4o',
        messages: [{ role: 'user', content: prompt }],
        temperature,
        stream: true,
      })
    });

    if (!response.ok || !response.body) return '';

    let generatedText = '';
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6).trim();
        if (data === '[DONE]') break;
        try {
          const parsed = JSON.parse(data);
          const textChunk = parsed.choices?.[0]?.delta?.content;
          if (textChunk) {
            generatedText += textChunk;
            res.write(`data: ${JSON.stringify({ token: textChunk })}\n\n`);
          }
        } catch {
          // Partial JSON
        }
      }
    }

    return generatedText;
  },

  // ---------------------------------------------------------------------------
  // Anthropic
  // ---------------------------------------------------------------------------

  async callAnthropic(apiKey: string, model: string, prompt: string, temperature: number): Promise<string | null> {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: model || 'claude-3-5-sonnet-20241022',
        max_tokens: 4096,
        messages: [{ role: 'user', content: prompt }],
        temperature,
      })
    });
    if (!response.ok) return null;
    const json: any = await response.json();
    return json.content?.[0]?.text || null;
  },

  async streamAnthropic(apiKey: string, model: string, prompt: string, temperature: number, res: Response): Promise<string> {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: model || 'claude-3-5-sonnet-20241022',
        max_tokens: 4096,
        messages: [{ role: 'user', content: prompt }],
        temperature,
        stream: true,
      })
    });

    if (!response.ok || !response.body) return '';

    let generatedText = '';
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        try {
          const parsed = JSON.parse(line.slice(6));
          if (parsed.type === 'content_block_delta') {
            const textChunk = parsed.delta?.text;
            if (textChunk) {
              generatedText += textChunk;
              res.write(`data: ${JSON.stringify({ token: textChunk })}\n\n`);
            }
          }
        } catch {
          // Partial JSON
        }
      }
    }

    return generatedText;
  },

  // ---------------------------------------------------------------------------
  // Cohere
  // ---------------------------------------------------------------------------

  async callCohere(apiKey: string, model: string, prompt: string, temperature: number): Promise<string | null> {
    const response = await fetch('https://api.cohere.com/v2/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: model || 'command-r-plus',
        messages: [{ role: 'user', content: prompt }],
        temperature,
      })
    });
    if (!response.ok) return null;
    const json: any = await response.json();
    return json.message?.content?.[0]?.text || null;
  },

  async streamCohere(apiKey: string, model: string, prompt: string, temperature: number, res: Response): Promise<string> {
    const response = await fetch('https://api.cohere.com/v2/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: model || 'command-r-plus',
        messages: [{ role: 'user', content: prompt }],
        temperature,
        stream: true,
      })
    });

    if (!response.ok || !response.body) return '';

    let generatedText = '';
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const parsed = JSON.parse(line);
          if (parsed.type === 'content-delta') {
            const textChunk = parsed.delta?.message?.content?.text;
            if (textChunk) {
              generatedText += textChunk;
              res.write(`data: ${JSON.stringify({ token: textChunk })}\n\n`);
            }
          }
        } catch {
          // Partial JSON
        }
      }
    }

    return generatedText;
  },

  // ---------------------------------------------------------------------------
  // Ollama (local)
  // ---------------------------------------------------------------------------

  async callOllamaSync(model: string, prompt: string, temperature: number): Promise<string | null> {
    const response = await fetch('http://localhost:11434/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: model || 'llama3',
        messages: [{ role: 'user', content: prompt }],
        stream: false,
        options: { temperature },
      })
    });
    if (!response.ok) return null;
    const json: any = await response.json();
    return json.message?.content || null;
  },

  async streamFromOllama(prompt: string, res: Response, model?: string): Promise<string> {
    const response = await fetch('http://localhost:11434/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: model || 'llama3',
        messages: [{ role: 'user', content: prompt }],
        stream: true
      })
    });

    if (!response.ok || !response.body) return '';

    let generatedText = '';
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const parsed = JSON.parse(line.trim());
          const textChunk = parsed.message?.content;
          if (textChunk) {
            generatedText += textChunk;
            res.write(`data: ${JSON.stringify({ token: textChunk })}\n\n`);
          }
        } catch {
          // Ignore
        }
      }
    }

    return generatedText;
  },

  // ---------------------------------------------------------------------------
  // Offline Mock Fallback
  // ---------------------------------------------------------------------------

  /**
   * Degraded response used only when no AI provider is reachable. It must never
   * assert facts about the document or imply it answered the question — it can
   * only surface the raw excerpts that matched and say the model is unavailable.
   */
  generateOfflineMock(intent: string, context: RetrievedChunk[]): string {
    if (context.length === 0) {
      return [
        '**No AI provider is configured, and no part of this document matched your question.**',
        '',
        'To get answers here:',
        '',
        '1. Add a provider API key under **Configuration → Settings**.',
        '2. Confirm the document finished processing (status `READY`).',
      ].join('\n');
    }

    const excerpts = context
      .slice(0, 3)
      .map((c, i) => {
        const text = c.text.replace(/\s+/g, ' ').trim().slice(0, 240);
        return `**[${i + 1}]** _page ${c.page}_\n\n> ${text}…`;
      })
      .join('\n\n');

    return [
      '**No AI provider is configured, so I cannot compose an answer yet.**',
      '',
      'Add a provider API key under **Configuration → Settings**. In the meantime, here are the passages that best matched your question:',
      '',
      excerpts,
    ].join('\n');
  }
};
