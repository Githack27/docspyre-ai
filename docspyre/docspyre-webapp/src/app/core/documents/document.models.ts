export type DocumentKind = 'IMAGE' | 'VIDEO' | 'AUDIO' | 'PDF' | 'DOCUMENT' | 'OTHER';

/** Derives a viewer render-kind from a MIME type (mirrors the backend logic). */
export function kindFromMime(mime: string | null | undefined): DocumentKind {
  const m = (mime || '').toLowerCase();
  if (m.startsWith('image/')) return 'IMAGE';
  if (m.startsWith('video/')) return 'VIDEO';
  if (m.startsWith('audio/')) return 'AUDIO';
  if (m === 'application/pdf') return 'PDF';
  if (
    m.startsWith('text/') ||
    m === 'application/json' ||
    ['word', 'document', 'presentation', 'spreadsheet', 'excel', 'powerpoint', 'opendocument', 'rtf'].some((h) => m.includes(h))
  ) {
    return 'DOCUMENT';
  }
  return 'OTHER';
}

export interface DocumentItem {
  id: string;
  name: string;
  kind: DocumentKind;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

/** Fine-grained, extension-driven category used for filtering & icons. */
export type DocSubtype =
  | 'IMAGE'
  | 'VIDEO'
  | 'AUDIO'
  | 'PDF'
  | 'WORD'
  | 'EXCEL'
  | 'PPT'
  | 'TEXT'
  | 'OTHER';

const EXTENSION_SUBTYPE: Record<string, DocSubtype> = {
  pdf: 'PDF',
  doc: 'WORD', docx: 'WORD', rtf: 'WORD', odt: 'WORD',
  xls: 'EXCEL', xlsx: 'EXCEL', csv: 'EXCEL', ods: 'EXCEL',
  ppt: 'PPT', pptx: 'PPT', odp: 'PPT',
  txt: 'TEXT', md: 'TEXT', json: 'TEXT', log: 'TEXT',
  png: 'IMAGE', jpg: 'IMAGE', jpeg: 'IMAGE', gif: 'IMAGE', webp: 'IMAGE', svg: 'IMAGE', bmp: 'IMAGE', avif: 'IMAGE',
  mp4: 'VIDEO', mov: 'VIDEO', mkv: 'VIDEO', webm: 'VIDEO', avi: 'VIDEO',
  mp3: 'AUDIO', wav: 'AUDIO', m4a: 'AUDIO', ogg: 'AUDIO', flac: 'AUDIO', aac: 'AUDIO',
};

/** Classifies a file by extension first (reliable), falling back to MIME. */
export function subtypeOf(name: string, mime?: string | null): DocSubtype {
  const ext = name.includes('.') ? name.split('.').pop()!.toLowerCase() : '';
  if (EXTENSION_SUBTYPE[ext]) return EXTENSION_SUBTYPE[ext];

  const m = (mime || '').toLowerCase();
  if (m.startsWith('image/')) return 'IMAGE';
  if (m.startsWith('video/')) return 'VIDEO';
  if (m.startsWith('audio/')) return 'AUDIO';
  if (m === 'application/pdf') return 'PDF';
  if (m.includes('presentation') || m.includes('powerpoint')) return 'PPT';
  if (m.includes('spreadsheet') || m.includes('excel') || m === 'text/csv') return 'EXCEL';
  if (m.includes('word') || m.includes('opendocument.text')) return 'WORD';
  if (m.startsWith('text/') || m === 'application/json') return 'TEXT';
  return 'OTHER';
}

/** Maps a file to the viewer render-kind, extension-first so PDFs always render. */
export function viewerKind(name: string, mime?: string | null): DocumentKind {
  const sub = subtypeOf(name, mime);
  if (sub === 'IMAGE' || sub === 'VIDEO' || sub === 'AUDIO' || sub === 'PDF') return sub;
  return 'DOCUMENT';
}

export function subtypeIcon(sub: DocSubtype): string {
  switch (sub) {
    case 'IMAGE': return 'bi-image';
    case 'VIDEO': return 'bi-camera-video-fill';
    case 'AUDIO': return 'bi-music-note-beamed';
    case 'PDF': return 'bi-file-earmark-pdf-fill';
    case 'WORD': return 'bi-file-earmark-word-fill';
    case 'EXCEL': return 'bi-file-earmark-spreadsheet-fill';
    case 'PPT': return 'bi-file-earmark-slides-fill';
    case 'TEXT': return 'bi-file-earmark-text-fill';
    default: return 'bi-file-earmark-fill';
  }
}

export function subtypeAccent(sub: DocSubtype): string {
  switch (sub) {
    case 'IMAGE': return 'blue';
    case 'VIDEO': return 'pink';
    case 'AUDIO': return 'green';
    case 'PDF': return 'orange';
    case 'WORD': return 'blue';
    case 'EXCEL': return 'green';
    case 'PPT': return 'orange';
    case 'TEXT': return 'violet';
    default: return 'violet';
  }
}

export interface DocumentFilter {
  id: 'ALL' | DocSubtype;
  label: string;
  icon: string;
  accent: string;
}

export const DOCUMENT_FILTERS: DocumentFilter[] = [
  { id: 'ALL', label: 'All', icon: 'bi-collection', accent: 'violet' },
  { id: 'IMAGE', label: 'Images', icon: 'bi-image', accent: 'blue' },
  { id: 'VIDEO', label: 'Videos', icon: 'bi-camera-video', accent: 'pink' },
  { id: 'AUDIO', label: 'Audio', icon: 'bi-music-note-beamed', accent: 'green' },
  { id: 'PDF', label: 'PDF', icon: 'bi-file-earmark-pdf', accent: 'orange' },
  { id: 'WORD', label: 'Word', icon: 'bi-file-earmark-word', accent: 'blue' },
  { id: 'EXCEL', label: 'Excel', icon: 'bi-file-earmark-spreadsheet', accent: 'green' },
  { id: 'PPT', label: 'Slides', icon: 'bi-file-earmark-slides', accent: 'orange' },
  { id: 'TEXT', label: 'Text', icon: 'bi-file-earmark-text', accent: 'violet' },
  { id: 'OTHER', label: 'Other', icon: 'bi-file-earmark', accent: 'violet' },
];

/** Human-readable byte size. */
export function formatBytes(bytes: number | null | undefined): string {
  if (bytes == null) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
