import { DocumentKind } from '@docspyre/database';

/** Classifies an uploaded file into a high-level kind from its MIME type. */
export function kindFromMime(mime: string): DocumentKind {
  const m = (mime || '').toLowerCase();
  if (m.startsWith('image/')) return DocumentKind.IMAGE;
  if (m.startsWith('video/')) return DocumentKind.VIDEO;
  if (m.startsWith('audio/')) return DocumentKind.AUDIO;
  if (m === 'application/pdf') return DocumentKind.PDF;

  const docHints = [
    'word',
    'document',
    'presentation',
    'spreadsheet',
    'excel',
    'powerpoint',
    'opendocument',
    'rtf',
  ];
  if (
    m.startsWith('text/') ||
    m === 'application/json' ||
    docHints.some((hint) => m.includes(hint))
  ) {
    return DocumentKind.DOCUMENT;
  }
  return DocumentKind.OTHER;
}
