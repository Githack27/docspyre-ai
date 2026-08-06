import { indexerService } from './indexer.service';
import type { RetrievedChunk } from './retriever.service';

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
    context: RetrievedChunk[]
  ): Promise<VerificationResult> {
    console.log(`[VerifierService] Starting claim verification on answer of length=${answer.length}`);

    // Parse out citations from the text (e.g. "claim [1]" or "claim [1][2]")
    const sentences = answer.split(/[.!?\n]+/).map(s => s.trim()).filter(s => s.length > 5);
    const apiKey = process.env.GEMINI_API_KEY;

    if (apiKey) {
      // 1. Try Gemini Verification
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

        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
              generationConfig: {
                temperature: 0.1,
                responseMimeType: 'application/json'
              }
            })
          }
        );

        if (response.ok) {
          const json: any = await response.json();
          const rawText = json.candidates?.[0]?.content?.parts?.[0]?.text;
          const parsed = JSON.parse(rawText.trim());
          if (Array.isArray(parsed)) {
            const hasUnsupported = parsed.some(c => !c.supported);
            return {
              status: hasUnsupported ? 'unsupported_claim_detected' : 'verified',
              claims: parsed.map(c => ({
                claim: c.claim,
                citationIndex: c.citationIndex,
                supported: c.supported,
                reason: c.reason
              }))
            };
          }
        }
      } catch (e) {
        console.error(`[VerifierService] Gemini claim verification failed, falling back to local verification:`, e);
      }
    }

    // 2. Fallback: Local Term Overlap Verification
    console.log(`[VerifierService] Executing local term overlap claim verification`);
    const verifiedClaims: VerifiedClaim[] = [];
    let hasUnsupported = false;

    for (const sentence of sentences) {
      // Extract bracket citation markers like [1], [2]
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

        // Check text overlap
        const sentenceTokens = indexerService.tokenizeText(sentence.replace(/\[\d+\]/g, ''));
        const sourceTokens = indexerService.tokenizeText(source.text);

        if (sentenceTokens.length === 0) continue;

        let matchCount = 0;
        for (const st of sentenceTokens) {
          if (sourceTokens.includes(st)) {
            matchCount++;
          }
        }

        const overlapRatio = matchCount / sentenceTokens.length;
        // If overlap ratio is > 20%, we consider it supported locally.
        const isSupported = overlapRatio >= 0.2;

        if (!isSupported) {
          hasUnsupported = true;
        }

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

    // If no citations were parsed but we have context, make sure we flag it or mark it verified
    const firstSentence = sentences[0];
    if (verifiedClaims.length === 0 && context.length > 0 && firstSentence) {
      // If we generated text but didn't cite anything, that's technically unsupported if it contains factual assertions
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
