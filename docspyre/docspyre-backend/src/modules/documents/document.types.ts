import type { DocumentKind } from '@docspyre/database';

/** Public shape of a document returned to clients (no storage internals). */
export interface PublicDocument {
  id: string;
  name: string;
  kind: DocumentKind;
  mimeType: string;
  sizeBytes: number;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}
