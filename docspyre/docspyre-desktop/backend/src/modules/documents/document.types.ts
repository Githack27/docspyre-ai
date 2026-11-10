export interface PublicDocument {
  id: string;
  name: string;
  kind: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  ingestionStatus: string;
  ingestionError: string | null;
  pageCount: number | null;
}
