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

/** Any ordered or unordered list item, capturing indent, marker and content. */
const LIST_ITEM_RE = /^(\s*)(\d+[.)]|[-*+])\s+(.*)$/;

interface ListItem {
  indent: number;
  ordered: boolean;
  content: string;
}

/** Leading whitespace width, counting a tab as four columns. */
const indentWidth = (raw: string): number => {
  let width = 0;
  for (const ch of raw) {
    if (ch === '\t') width += 4;
    else if (ch === ' ') width += 1;
    else break;
  }
  return width;
};

const parseListItem = (line: string): ListItem | null => {
  const match = line.match(LIST_ITEM_RE);
  if (!match) return null;
  return {
    indent: indentWidth(match[1] ?? ''),
    ordered: /\d/.test(match[2] ?? ''),
    content: match[3] ?? '',
  };
};

/**
 * Renders a contiguous run of list items into nested <ul>/<ol> markup.
 *
 * Collects every consecutive list line, then builds the tree from a stack keyed
 * on indentation width. Each deeper indent opens a nested list on the previous
 * item; each shallower indent closes lists back to the matching level. This
 * produces correct nesting for the multi-level bullets the agent emits.
 */
function renderList(lines: string[], start: number): { html: string; next: number } {
  const items: ListItem[] = [];
  let i = start;

  while (i < lines.length) {
    const item = parseListItem(lines[i] ?? '');
    if (!item) break;
    items.push(item);
    i++;
  }

  return { html: buildListTree(items), next: i };
}

interface OpenList {
  indent: number;
  ordered: boolean;
  parts: string[];
}

/** Assembles nested list HTML from a flat, indent-tagged item sequence. */
function buildListTree(items: ListItem[]): string {
  const stack: OpenList[] = [];
  const finished: string[] = [];

  /** Closes the innermost list and folds it into its parent item. */
  const close = (): void => {
    const list = stack.pop();
    if (!list) return;
    const tag = list.ordered ? 'ol' : 'ul';
    const markup = `<${tag} class="md-list">${list.parts.join('')}</${tag}>`;

    const parent = stack[stack.length - 1];
    if (parent) {
      // Attach the sublist inside the parent's last <li>.
      const lastIndex = parent.parts.length - 1;
      if (lastIndex >= 0) {
        parent.parts[lastIndex] = parent.parts[lastIndex]!.replace(/<\/li>$/, `${markup}</li>`);
      } else {
        parent.parts.push(`<li>${markup}</li>`);
      }
    } else {
      finished.push(markup);
    }
  };

  for (const item of items) {
    // Close deeper/sibling lists until the stack top is an ancestor.
    while (stack.length && item.indent < stack[stack.length - 1]!.indent) {
      close();
    }

    const top = stack[stack.length - 1];

    if (top && item.indent === top.indent) {
      // Same level, but a marker-type switch (bullet <-> number) starts a new list.
      if (top.ordered !== item.ordered) {
        close();
        stack.push({ indent: item.indent, ordered: item.ordered, parts: [] });
      }
    } else if (!top || item.indent > top.indent) {
      // Open a deeper list.
      stack.push({ indent: item.indent, ordered: item.ordered, parts: [] });
    }

    stack[stack.length - 1]!.parts.push(`<li>${renderInline(item.content)}</li>`);
  }

  while (stack.length) close();

  return finished.join('');
}

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

    // List (ordered or unordered), with arbitrary nesting by indentation.
    if (LIST_ITEM_RE.test(line)) {
      const { html: listHtml, next } = renderList(lines, i);
      html.push(listHtml);
      i = next;
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
        LIST_ITEM_RE.test(cur)
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
