type DocumentKind = 'IMAGE' | 'VIDEO' | 'AUDIO' | 'PDF' | 'DOCUMENT' | 'OTHER';

export function kindFromMime(mime: string): DocumentKind {
  const m = (mime || '').toLowerCase();
  if (m.startsWith('image/')) return 'IMAGE';
  if (m.startsWith('video/')) return 'VIDEO';
  if (m.startsWith('audio/')) return 'AUDIO';
  if (m === 'application/pdf') return 'PDF';

  const docHints = ['word', 'document', 'presentation', 'spreadsheet', 'excel', 'powerpoint', 'opendocument', 'rtf'];
  if (m.startsWith('text/') || m === 'application/json' || docHints.some((hint) => m.includes(hint))) {
    return 'DOCUMENT';
  }
  return 'OTHER';
}
