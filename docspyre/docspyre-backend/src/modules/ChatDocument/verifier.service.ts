import { indexerService } from './indexer.service';
import { generatorService } from './generator.service';
import type { RetrievedChunk } from './retriever.service';
import type { ResolvedProvider } from './provider-resolver.service';

export interface VerifiedClaim {
  claim: string;
  citationIndex: number;
  supported: boolean;
  reason?: string;
}

export interface VerificationResult {
  status: 'verified' | 'unsupported_claim_detected';
  claims: VerifiedClaim[];
}

export const verifierService = {
  /**
   * Verifies that the generated answer claims are grounded in their cited context chunks.
   */
  async verifyAnswer(
    answer: string,
    citations: { index: number; chunk_id: string }[],
    context: RetrievedChunk[],
    provider?: ResolvedProvider | null
  ): Promise<VerificationResult> {
    const sentences = answer.split(/[.!?\n]+/).map(s => s.trim()).filter(s => s.length > 5);

    if (provider) {
      try {
        const prompt = `You are a strict factual claim verifier.
Analyze the following Answer and check if its claims are fully supported by the Cited Context.

Cited Context:
${context.map((c, idx) => `[Source ${idx + 1}]: ${c.parent_text || c.text}`).join('\n\n')}

Answer:
"${answer}"

Extract the key claims and check if they are supported by the corresponding cited source.
Respond ONLY with a JSON array in the following format:
[
  { "claim": "claim text", "citationIndex": 1, "supported": true, "reason": "reason why" }
]`;

        const text = await generatorService.callProvider(provider, prompt, 0.1);
        if (text) {
          const parsed = JSON.parse(text.trim());
          if (Array.isArray(parsed)) {
            const hasUnsupported = parsed.some((c: any) => !c.supported);
            return {
              status: hasUnsupported ? 'unsupported_claim_detected' : 'verified',
              claims: parsed.map((c: any) => ({
                claim: c.claim,
                citationIndex: c.citationIndex,
                supported: c.supported,
                reason: c.reason
              }))
            };
          }
        }
      } catch {
        // Provider verification failed, fall back to local
      }
    }

    // Fallback: Local Term Overlap Verification
    const verifiedClaims: VerifiedClaim[] = [];
    let hasUnsupported = false;

    for (const sentence of sentences) {
      const matches = sentence.match(/\[(\d+)\]/g);
      if (!matches) continue;

      for (const match of matches) {
        const citationIndex = parseInt(match.replace(/[\[\]]/g, ''), 10);
        const source = context[citationIndex - 1];

        if (!source) {
          verifiedClaims.push({
            claim: sentence,
            citationIndex,
            supported: false,
            reason: `Citation [${citationIndex}] points to a source index that does not exist.`
          });
          hasUnsupported = true;
          continue;
        }

        const sentenceTokens = indexerService.tokenizeText(sentence.replace(/\[\d+\]/g, ''));
        const sourceTokens = indexerService.tokenizeText(source.text);

        if (sentenceTokens.length === 0) continue;

        let matchCount = 0;
        for (const st of sentenceTokens) {
          if (sourceTokens.includes(st)) matchCount++;
        }

        const overlapRatio = matchCount / sentenceTokens.length;
        const isSupported = overlapRatio >= 0.2;

        if (!isSupported) hasUnsupported = true;

        verifiedClaims.push({
          claim: sentence,
          citationIndex,
          supported: isSupported,
          reason: isSupported
            ? `Verified locally via token overlap (ratio: ${(overlapRatio * 100).toFixed(0)}%).`
            : `Factual terms in sentence do not match cited text on page ${source.page}.`
        });
      }
    }

    const firstSentence = sentences[0];
    if (verifiedClaims.length === 0 && context.length > 0 && firstSentence) {
      verifiedClaims.push({
        claim: firstSentence,
        citationIndex: 1,
        supported: false,
        reason: 'The generated answer does not contain any inline citation markers.'
      });
      hasUnsupported = true;
    }

    return {
      status: hasUnsupported ? 'unsupported_claim_detected' : 'verified',
      claims: verifiedClaims
    };
  }
};
