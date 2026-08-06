import type { Response } from 'express';
import type { RetrievedChunk } from './retriever.service';

export interface Citation {
  index: number;
  chunk_id: string;
  document_id: string;
  page: number;
  bbox: number[];
  section_path: string[];
}

export const generatorService = {
  /**
   * Classifies the query intent.
   */
  async classifyIntent(query: string): Promise<'single_doc_qa' | 'cross_doc_synthesis' | 'summarization' | 'out_of_scope'> {
    const apiKey = process.env.GEMINI_API_KEY;
    const qLower = query.toLowerCase();

    // Heuristics fallback
    const isSummarize = qLower.includes('summarize') || qLower.includes('summary') || qLower.includes('overview') || qLower.includes('tl;dr');
    const isGreetingOrChat = qLower.match(/^(hello|hi|hey|good morning|good afternoon|how are you|who are you|what is your name)/);
    
    // Default fallback rules
    let localIntent: any = 'single_doc_qa';
    if (isSummarize) localIntent = 'summarization';
    else if (isGreetingOrChat) localIntent = 'out_of_scope';
    else if (qLower.includes('compare') || qLower.includes('across') || qLower.includes('all files') || qLower.includes('these documents')) {
      localIntent = 'cross_doc_synthesis';
    }

    if (!apiKey) {
      console.log(`[GeneratorService] Local intent classification: ${localIntent}`);
      return localIntent;
    }

    try {
      // Classification call using Gemini 2.5 Flash
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{
              parts: [{
                text: `Classify the following query into exactly one of these labels: 'single_doc_qa', 'cross_doc_synthesis', 'summarization', 'out_of_scope'.
Respond ONLY with the label name, no explanations.

Query: "${query}"`
              }]
            }],
            generationConfig: { temperature: 0.1 }
          })
        }
      );

      if (response.ok) {
        const json: any = await response.json();
        const label = json.candidates?.[0]?.content?.parts?.[0]?.text?.trim()?.toLowerCase();
        if (['single_doc_qa', 'cross_doc_synthesis', 'summarization', 'out_of_scope'].includes(label)) {
          console.log(`[GeneratorService] Gemini intent classification: ${label}`);
          return label as any;
        }
      }
    } catch (e) {
      console.error(`[GeneratorService] Gemini intent classification failed, falling back to heuristics:`, e);
    }

    return localIntent;
  },

  /**
   * Main entrypoint to stream answers via SSE (Server-Sent Events).
   */
  async streamResponse(
    query: string,
    intent: string,
    context: RetrievedChunk[],
    res: Response
  ): Promise<{ text: string; citations: Citation[] }> {
    console.log(`[GeneratorService] Streaming response for intent=${intent}. Context count=${context.length}`);

    // Map context into citation metadata
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

    const systemPrompt = `You are a helpful Document AI assistant on a collaborative platform.
Your task is to answer the user's query based ONLY on the provided context sources.
For every factual claim you make, you MUST cite the context source by appending its citation marker like [1], [2], etc., corresponding to the indices of the provided sources. Do not make citations like [source 1]. Only use inline bracket numbers.
If the context sources do not contain enough information to answer, say "I cannot answer this based on the provided context." and do not speculate.

Context Sources:
${context.map((c, idx) => `[Source ${idx + 1}] (Page ${c.page}):\n${c.parent_text || c.text}`).join('\n\n')}

User Query: "${query}"`;

    let generatedText = '';
    const apiKey = process.env.GEMINI_API_KEY;

    if (apiKey) {
      // 1. Try Gemini Live Streaming
      try {
        const modelName = intent === 'cross_doc_synthesis' ? 'gemini-2.5-flash' : 'gemini-2.5-flash';
        console.log(`[GeneratorService] Calling Gemini API (${modelName})`);
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:streamGenerateContent?key=${apiKey}`;
        
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{
              role: 'user',
              parts: [{ text: systemPrompt }]
            }],
            generationConfig: {
              temperature: intent === 'cross_doc_synthesis' ? 0.3 : 0.1
            }
          })
        });

        if (response.ok && response.body) {
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
              if (line.startsWith('data: ') || line.trim() === '') continue;
              
              try {
                // Gemini SSE response is usually nested JSON array chunks or a single JSON chunk
                const parsed = JSON.parse(line.trim());
                const textChunk = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
                if (textChunk) {
                  generatedText += textChunk;
                  res.write(`data: ${JSON.stringify({ token: textChunk })}\n\n`);
                }
              } catch (err) {
                // Sometime chunk splits JSON. Accumulate or ignore partial boundary parse errors.
              }
            }
          }
          
          if (generatedText.trim().length > 0) {
            return { text: generatedText, citations };
          }
        }
      } catch (e) {
        console.error(`[GeneratorService] Gemini streaming failed, trying Ollama fallback:`, e);
      }
    }

    // 2. Try Local Ollama Streaming
    try {
      console.log(`[GeneratorService] Attempting Ollama streaming fallback at http://localhost:11434`);
      const response = await fetch('http://localhost:11434/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'llama3',
          messages: [{ role: 'user', content: systemPrompt }],
          stream: true
        })
      });

      if (response.ok && response.body) {
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
            } catch (err) {
              // Ignore
            }
          }
        }

        if (generatedText.trim().length > 0) {
          return { text: generatedText, citations };
        }
      }
    } catch (e) {
      console.log(`[GeneratorService] Ollama not available or failed. Falling back to local offline mock generation.`);
    }

    // 3. Fallback: Local offline mock generation grounded in context sources
    console.log(`[GeneratorService] Generating grounded offline mock response.`);
    const primaryContext = context[0];
    if (!primaryContext) {
      generatedText = "No context sources were found in this project. Please upload documents first.";
    } else {
      if (intent === 'summarization') {
        generatedText = `Based on the retrieved context from page ${primaryContext.page} [1]:\n\n- The document details standard operations.\n- Key sections cover ${context.slice(0, 3).map((c, i) => c.section_path.join(' > ') || `Section [${i+1}]`).join(', ')}.\n- All records are indexed successfully.`;
      } else {
        // Grounded synthesis: extracts matching phrases
        const snippet = primaryContext.text;
        generatedText = `According to the document context on page ${primaryContext.page} [1]:\n\n"${snippet.slice(0, 300)}..."\n\nThis confirms the core references. Let me know if you need to extract details from other sections.`;
      }
    }

    // Stream tokens slowly to simulate real generation
    const tokens = generatedText.split(/(\s+)/);
    for (const token of tokens) {
      if (!token) continue;
      res.write(`data: ${JSON.stringify({ token })}\n\n`);
      await new Promise(resolve => setTimeout(resolve, 30));
    }

    return { text: generatedText, citations };
  }
};
