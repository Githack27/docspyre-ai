import { Pipe, PipeTransform } from '@angular/core';
import { renderMarkdown } from './markdown';

/**
 * Renders Markdown to HTML for use with `[innerHTML]`.
 *
 * Pure by design: during token streaming the message content changes on every
 * chunk, and a pure pipe recomputes only on those changes rather than on every
 * change-detection pass.
 */
@Pipe({ name: 'markdown' })
export class MarkdownPipe implements PipeTransform {
  transform(value: string | null | undefined): string {
    return renderMarkdown(value ?? '');
  }
}
