import type { RetrievedChunk } from '../retrieval/retriever.service';
import { renderChunks } from './document-qa.prompt';

export const VERIFIER_SYSTEM = `You audit whether an assistant's answer is supported by the source excerpts it was given.

For each substantive factual claim in the answer, decide:
- "supported": the excerpts state it, or it follows by direct arithmetic on stated values.
- "unsupported": the excerpts do not state it.
- "contradicted": the excerpts state something incompatible with it.

Ignore hedges, clarifying questions, formatting and statements about the assistant's own limitations.

Return strict JSON and nothing else:
{"claims":[{"text":"<claim, max 160 chars>","verdict":"supported|unsupported|contradicted","sources":[<source numbers>]}]}
Return {"claims":[]} when the answer makes no factual claims.`;

export const buildVerifierPrompt = (input: {
  answer: string;
  chunks: RetrievedChunk[];
}): string =>
  [
    `## Source excerpts\n${renderChunks(input.chunks)}`,
    `## Answer to audit\n${input.answer}`,
    'JSON:',
  ].join('\n\n');
