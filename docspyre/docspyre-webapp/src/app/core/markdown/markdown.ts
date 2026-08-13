/**
 * Minimal Markdown -> HTML renderer for assistant chat replies.
 *
 * Security: the source is HTML-escaped *before* any markup is generated, so no
 * caller-supplied tag can survive into the output. Only tags this renderer emits
 * itself are present in the result.
 *
 * Supported subset (what the agent prompt is allowed to emit): headings,
 * bold/italic, inline code, fenced code blocks, ordered/unordered lists,
 * blockquotes, tables, links and citation markers.
 */

const escapeHtml = (raw: string): string =>
  raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

/** Applies inline formatting to already-escaped text. */
function renderInline(escaped: string): string {
  const codeSpans: string[] = [];

  // Pull inline code out first so ** and _ inside it are left alone.
  let out = escaped.replace(/`([^`]+)`/g, (_m, code: string) => {
    codeSpans.push(`<code>${code}</code>`);
    return `\u0000CODE${codeSpans.length - 1}\u0000`;
  });

  // Links: [text](url). Only http(s) and mailto are allowed.
  out = out.replace(
    /\[([^\]]+)\]\((https?:\/\/[^\s)]+|mailto:[^\s)]+)\)/g,
    (_m, text: string, href: string) =>
      `<a href="${href}" target="_blank" rel="noopener noreferrer">${text}</a>`,
  );

  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/(^|[\s(])\*([^*\n]+)\*/g, '$1<em>$2</em>');
  out = out.replace(/(^|[\s(])_([^_\n]+)_/g, '$1<em>$2</em>');

  // Citation markers such as [1] or [2][3] get a hook for styling.
  out = out.replace(/\[(\d+)\]/g, '<span class="md-cite">[$1]</span>');

  return out.replace(/\u0000CODE(\d+)\u0000/g, (_m, i: string) => codeSpans[Number(i)] ?? '');
}

const splitRow = (line: string): string[] =>
  line
    .replace(/^\s*\|/, '')
    .replace(/\|\s*$/, '')
    .split('|')
    .map((c) => c.trim());

const isTableDivider = (line: string): boolean => /^\s*\|?[\s:|-]+\|[\s:|-]*$/.test(line) && line.includes('-');

/** Blockquote marker. Matches "&gt;" because escaping runs before block parsing. */
const QUOTE_RE = /^\s*&gt;\s?/;

export function renderMarkdown(source: string): string {
  if (!source) return '';

  const lines = escapeHtml(source.replace(/\r\n?/g, '\n')).split('\n');
  const html: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i] ?? '';

    // Blank line
    if (!line.trim()) {
      i++;
      continue;
    }

    // Fenced code block
    if (/^\s*```/.test(line)) {
      const body: string[] = [];
      i++;
      while (i < lines.length && !/^\s*```/.test(lines[i] ?? '')) {
        body.push(lines[i] ?? '');
        i++;
      }
      i++; // closing fence
      html.push(`<pre class="md-pre"><code>${body.join('\n')}</code></pre>`);
      continue;
    }

    // Heading
    const heading = line.match(/^\s*(#{1,6})\s+(.*)$/);
    if (heading) {
      const level = Math.min(heading[1]!.length + 1, 6); // shift down: # -> h2
      html.push(`<h${level} class="md-h">${renderInline(heading[2]!)}</h${level}>`);
      i++;
      continue;
    }

    // Table: header row followed by a divider row
    if (line.includes('|') && isTableDivider(lines[i + 1] ?? '')) {
      const headers = splitRow(line);
      i += 2;
      const bodyRows: string[][] = [];
      while (i < lines.length && (lines[i] ?? '').includes('|') && (lines[i] ?? '').trim()) {
        bodyRows.push(splitRow(lines[i] ?? ''));
        i++;
      }
      const head = headers.map((h) => `<th>${renderInline(h)}</th>`).join('');
      const body = bodyRows
        .map((r) => `<tr>${r.map((c) => `<td>${renderInline(c)}</td>`).join('')}</tr>`)
        .join('');
      html.push(
        `<div class="md-table-wrap"><table class="md-table"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`,
      );
      continue;
    }

    // Blockquote. Note: escaping already ran, so ">" appears as "&gt;".
    if (QUOTE_RE.test(line)) {
      const body: string[] = [];
      while (i < lines.length && QUOTE_RE.test(lines[i] ?? '')) {
        body.push((lines[i] ?? '').replace(QUOTE_RE, ''));
        i++;
      }
      html.push(`<blockquote class="md-quote">${renderInline(body.join(' '))}</blockquote>`);
      continue;
    }

    // Ordered list
    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i] ?? '')) {
        items.push((lines[i] ?? '').replace(/^\s*\d+\.\s+/, ''));
        i++;
      }
      html.push(
        `<ol class="md-list">${items.map((t) => `<li>${renderInline(t)}</li>`).join('')}</ol>`,
      );
      continue;
    }

    // Unordered list
    if (/^\s*[-*+]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i] ?? '')) {
        items.push((lines[i] ?? '').replace(/^\s*[-*+]\s+/, ''));
        i++;
      }
      html.push(
        `<ul class="md-list">${items.map((t) => `<li>${renderInline(t)}</li>`).join('')}</ul>`,
      );
      continue;
    }

    // Paragraph: consume until a blank line or the start of another block
    const para: string[] = [];
    while (i < lines.length) {
      const cur = lines[i] ?? '';
      if (
        !cur.trim() ||
        /^\s*```/.test(cur) ||
        /^\s*#{1,6}\s+/.test(cur) ||
        QUOTE_RE.test(cur) ||
        /^\s*\d+\.\s+/.test(cur) ||
        /^\s*[-*+]\s+/.test(cur)
      ) {
        break;
      }
      para.push(cur);
      i++;
    }
    html.push(`<p class="md-p">${renderInline(para.join('<br />'))}</p>`);
  }

  return html.join('');
}
