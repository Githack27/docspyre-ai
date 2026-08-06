import { prisma } from '../../db/prisma';
import type { Chunk } from './chunker.service';

const STOP_WORDS = new Set([
  'a', 'about', 'above', 'after', 'again', 'against', 'all', 'am', 'an', 'and', 'any', 'are', 'arent',
  'as', 'at', 'be', 'because', 'been', 'before', 'being', 'below', 'between', 'both', 'but', 'by',
  'cant', 'cannot', 'could', 'couldnt', 'did', 'didnt', 'do', 'does', 'doesnt', 'doing', 'dont', 'down',
  'during', 'each', 'few', 'for', 'from', 'further', 'had', 'hadnt', 'has', 'hasnt', 'have', 'havent',
  'having', 'he', 'hed', 'hell', 'hes', 'her', 'here', 'heres', 'hers', 'herself', 'him', 'himself',
  'his', 'how', 'hows', 'i', 'id', 'ill', 'im', 'ive', 'if', 'in', 'into', 'is', 'isnt', 'it', 'its',
  'itself', 'lets', 'me', 'more', 'most', 'mustnt', 'my', 'myself', 'no', 'nor', 'not', 'of', 'off',
  'on', 'once', 'only', 'or', 'other', 'ought', 'our', 'ours', 'ourselves', 'out', 'over', 'own',
  'same', 'shant', 'she', 'shed', 'shell', 'shes', 'should', 'shouldnt', 'so', 'some', 'such', 'than',
  'that', 'thats', 'the', 'their', 'theirs', 'them', 'themselves', 'then', 'there', 'theres', 'these',
  'they', 'theyd', 'theyll', 'theyre', 'theyve', 'this', 'those', 'through', 'to', 'too', 'under',
  'until', 'up', 'very', 'was', 'wasnt', 'we', 'wed', 'well', 'were', 'weve', 'werent', 'what', 'whats',
  'when', 'whens', 'where', 'wheres', 'which', 'while', 'who', 'whos', 'whom', 'why', 'whys', 'with',
  'wont', 'would', 'wouldnt', 'you', 'youd', 'youll', 'youre', 'youve', 'your', 'yours', 'yourself',
  'yourselves'
]);

/** Simple stemmer (suffix stripping) to keep retrieval simple and clean. */
function stemWord(word: string): string {
  let w = word.toLowerCase().trim().replace(/[^a-z0-9]/g, '');
  if (w.length <= 2) return w;
  if (w.endsWith('sses')) return w.slice(0, -2);
  if (w.endsWith('ies')) return w.slice(0, -3) + 'i';
  if (w.endsWith('ss')) return w;
  if (w.endsWith('s') && !w.endsWith('us') && !w.endsWith('is') && !w.endsWith('as')) return w.slice(0, -1);
  if (w.endsWith('eed')) return w.endsWith('eed') ? w.slice(0, -1) : w;
  if (w.endsWith('ing')) return w.slice(0, -3);
  if (w.endsWith('ed')) return w.slice(0, -2);
  return w;
}

export const indexerService = {
  /**
   * Generates keyword tokens for sparse indexing (BM25).
   */
  tokenizeText(text: string): string[] {
    const words = text.toLowerCase().split(/[\s,.\-\/()\[\]{}#_!?]+/);
    const tokens = new Set<string>();
    for (const w of words) {
      if (!w || STOP_WORDS.has(w) || w.length < 2) continue;
      tokens.add(stemWord(w));
    }
    return Array.from(tokens).filter(Boolean);
  },

  /**
   * Tries Gemini Embeddings API.
   */
  async getGeminiEmbedding(text: string): Promise<number[] | null> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return null;

    try {
      console.log(`[IndexerService] Requesting Gemini embedding...`);
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'models/text-embedding-004',
            content: { parts: [{ text }] }
          })
        }
      );

      if (!response.ok) {
        const errText = await response.text();
        console.error(`[IndexerService] Gemini embedding API failed: status=${response.status}, body=${errText}`);
        return null;
      }

      const json: any = await response.json();
      const embedding = json.embedding?.values;
      if (Array.isArray(embedding)) {
        return embedding;
      }
      return null;
    } catch (e) {
      console.error(`[IndexerService] Gemini embedding request failed:`, e);
      return null;
    }
  },

  /**
   * Tries Ollama Embeddings API.
   */
  async getOllamaEmbedding(text: string): Promise<number[] | null> {
    try {
      console.log(`[IndexerService] Requesting Ollama embedding...`);
      // We try the standard Ollama endpoints. nomic-embed-text is the default text embedding model.
      const response = await fetch('http://localhost:11434/api/embed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'nomic-embed-text',
          input: text
        })
      });

      if (response.ok) {
        const json: any = await response.json();
        if (Array.isArray(json.embeddings) && Array.isArray(json.embeddings[0])) {
          return json.embeddings[0];
        }
        if (Array.isArray(json.embedding)) {
          return json.embedding;
        }
      }

      // Try fallback legacy /api/embeddings
      const responseLegacy = await fetch('http://localhost:11434/api/embeddings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'nomic-embed-text',
          prompt: text
        })
      });

      if (responseLegacy.ok) {
        const json: any = await responseLegacy.json();
        if (Array.isArray(json.embedding)) {
          return json.embedding;
        }
      }

      return null;
    } catch (e) {
      // Offline or Ollama not running
      return null;
    }
  },

  /**
   * Fallback: generates a stable unit-length 768-dimension vector based on text content.
   */
  getDeterministicEmbedding(text: string): number[] {
    const vector = new Array(768).fill(0);
    const words = text.toLowerCase().split(/\s+/).filter(Boolean);

    // Sum word char codes mapped to dimensions
    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      if (!word) continue;
      let hash = 0;
      for (let j = 0; j < word.length; j++) {
        hash = word.charCodeAt(j) + (hash << 6) + (hash << 16) - hash;
      }
      const dim = Math.abs(hash) % 768;
      // Weight by position and word length
      vector[dim] += (word.length / (i + 1));
    }

    // Add general character n-gram frequencies to smoothen
    for (let i = 0; i < text.length - 2; i++) {
      const trigram = text.substring(i, i + 3);
      let hash = 0;
      for (let j = 0; j < trigram.length; j++) {
        hash = trigram.charCodeAt(j) + (hash << 5) - hash;
      }
      const dim = Math.abs(hash) % 768;
      vector[dim] += 0.5;
    }

    // Normalize to unit length
    let norm = 0;
    for (let i = 0; i < 768; i++) {
      norm += vector[i] * vector[i];
    }
    norm = Math.sqrt(norm);
    if (norm > 0) {
      for (let i = 0; i < 768; i++) {
        vector[i] = vector[i] / norm;
      }
    } else {
      vector[0] = 1.0;
    }

    return vector;
  },

  /**
   * Generates a 768-dim dense embedding vector using the best available provider.
   */
  async generateEmbedding(text: string): Promise<number[]> {
    // 1. Try Gemini
    let emb = await this.getGeminiEmbedding(text);
    if (emb) return emb;

    // 2. Try Ollama
    emb = await this.getOllamaEmbedding(text);
    if (emb) return emb;

    // 3. Fallback
    return this.getDeterministicEmbedding(text);
  },

  /**
   * Indexes all chunks generated from a document.
   */
  async indexChunks(documentId: string, chunks: Chunk[]): Promise<void> {
    console.log(`[IndexerService] Indexing chunks for documentId=${documentId}. Count=${chunks.length}`);
    
    // Clear any existing chunks for this document
    await prisma.documentChunk.deleteMany({
      where: { documentId }
    });

    // Ingest chunks in batches of 10 to keep database load reasonable and avoid thread exhaustion
    const batchSize = 10;
    for (let i = 0; i < chunks.length; i += batchSize) {
      const batch = chunks.slice(i, i + batchSize);
      
      const createPromises = batch.map(async (chunk) => {
        const embedding = await this.generateEmbedding(chunk.text);
        const keywords = this.tokenizeText(chunk.text);

        return prisma.documentChunk.create({
          data: {
            documentId,
            chunkId: chunk.chunk_id,
            parentChunkId: chunk.parent_chunk_id,
            page: chunk.page,
            sectionPath: chunk.section_path,
            bbox: chunk.bbox,
            chunkType: chunk.chunk_type,
            text: chunk.text,
            embedding,
            keywords
          }
        });
      });

      await Promise.all(createPromises);
      console.log(`[IndexerService] Ingested batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(chunks.length / batchSize)}`);
    }

    console.log(`[IndexerService] Successfully indexed all chunks for documentId=${documentId}`);
  }
};
