import { createChatModel } from '../../llm/model.factory';
import { messageText, extractJson } from '../../llm/output';
import { logger } from '../../../../core/utils/logger';
import { VERIFIER_SYSTEM, buildVerifierPrompt } from '../prompts';
import type { AgentRuntime } from '../runtime';
import type {
  AgentStateType,
  AgentStateUpdate,
  ClaimVerdict,
  ClaimVerification,
  VerifiedClaim,
} from '../state';

interface VerifierPayload {
  claims?: {
    text?: unknown;
    verdict?: unknown;
    sources?: unknown;
  }[];
}

const VERDICTS: readonly ClaimVerdict[] = ['supported', 'unsupported', 'contradicted'];

/** Overlap-based check used when no model is available to audit. */
const lexicalVerification = (answer: string, sources: string[]): ClaimVerification => {
  const vocabulary = new Set(
    sources
      .join(' ')
      .toLowerCase()
      .split(/\W+/)
      .filter((token) => token.length > 3),
  );

  const sentences = answer
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 25)
    .slice(0, 6);

  if (!sentences.length || !vocabulary.size) {
    return { status: 'unverified', claims: [] };
  }

  const claims: VerifiedClaim[] = sentences.map((sentence) => {
    const tokens = sentence.toLowerCase().split(/\W+/).filter((token) => token.length > 3);
    const overlap = tokens.filter((token) => vocabulary.has(token)).length;
    const ratio = tokens.length ? overlap / tokens.length : 0;
    const supported = ratio >= 0.35;

    return {
      text: sentence.slice(0, 160),
      verdict: supported ? 'supported' : 'unsupported',
      supported,
      sources: [],
    };
  });

  return { status: summarise(claims), claims };
};

const summarise = (claims: VerifiedClaim[]): ClaimVerification['status'] => {
  if (!claims.length) return 'verified';
  if (claims.some((claim) => claim.verdict === 'contradicted')) return 'unverified';

  const supported = claims.filter((claim) => claim.verdict === 'supported').length;
  if (supported === claims.length) return 'verified';
  if (supported === 0) return 'unverified';
  return 'partially_verified';
};

/**
 * Audits the answer against the excerpts it was given. Only meaningful for the
 * grounded document branch; other branches skip it.
 */
export const verifyNode = (runtime: AgentRuntime) =>
  async (state: AgentStateType): Promise<AgentStateUpdate> => {
    if (!state.answer.trim() || !state.chunks.length || state.answerSource === 'degraded') {
      return { verification: { status: 'skipped', claims: [] } };
    }

    const sourceTexts = state.chunks.map((chunk) => chunk.parent_text || chunk.text);

    if (!runtime.provider) {
      return { verification: lexicalVerification(state.answer, sourceTexts) };
    }

    try {
      const model = createChatModel(runtime.provider, { temperature: 0, maxTokens: 1200 });
      const response = await model.invoke([
        { role: 'system', content: VERIFIER_SYSTEM },
        {
          role: 'user',
          content: buildVerifierPrompt({ answer: state.answer, chunks: state.chunks }),
        },
      ]);

      const parsed = extractJson<VerifierPayload>(messageText(response));

      if (!parsed || !Array.isArray(parsed.claims)) {
        return { verification: lexicalVerification(state.answer, sourceTexts) };
      }

      const claims: VerifiedClaim[] = parsed.claims
        .map((claim) => {
          const text = typeof claim.text === 'string' ? claim.text.trim().slice(0, 160) : '';
          if (!text) return null;

          const rawVerdict = String(claim.verdict ?? '').toLowerCase() as ClaimVerdict;
          const verdict: ClaimVerdict = VERDICTS.includes(rawVerdict) ? rawVerdict : 'unsupported';

          const sources = Array.isArray(claim.sources)
            ? claim.sources
                .map((value) => Number(value))
                .filter((value) => Number.isInteger(value) && value > 0)
            : [];

          return { text, verdict, supported: verdict === 'supported', sources };
        })
        .filter((claim): claim is VerifiedClaim => claim !== null);

      return { verification: { status: summarise(claims), claims } };
    } catch (error) {
      logger.debug('Verifier model failed, using lexical check', {
        error: error instanceof Error ? error.message : String(error),
      });
      return { verification: lexicalVerification(state.answer, sourceTexts) };
    }
  };
