import { prisma } from '../../db/prisma';
import { DocumentKind, type Prisma } from '@docspyre/database';
import { ApiError } from '../../utils/api-error';
import { kindFromMime } from './document.kind';
import { removeFile, saveBuffer } from './document.storage';
import type { PublicDocument } from './document.types';
import { ingestionQueue } from '../ChatDocument/queue.service';

type DocumentRow = Prisma.DocumentGetPayload<Record<string, never>>;

interface CreateDocumentInput {
  originalName: string;
  mimeType: string;
  buffer: Buffer;
}

const toPublic = (d: DocumentRow): PublicDocument => ({
  id: d.id,
  name: d.name,
  kind: d.kind,
  mimeType: d.mimeType,
  sizeBytes: d.sizeBytes,
  createdAt: d.createdAt,
  updatedAt: d.updatedAt,
  deletedAt: d.deletedAt,
  ingestionStatus: d.ingestionStatus,
  ingestionError: d.ingestionError,
  pageCount: d.pageCount,
});

export const documentService = {
  /** Stores an uploaded file on disk and records its metadata. */
  async create(ownerId: string, input: CreateDocumentInput): Promise<PublicDocument> {
    const storageKey = await saveBuffer(input.originalName, input.buffer);
    const doc = await prisma.document.create({
      data: {
        ownerId,
        name: input.originalName,
        storageKey,
        mimeType: input.mimeType || 'application/octet-stream',
        kind: kindFromMime(input.mimeType),
        sizeBytes: input.buffer.length,
      },
    });

    // Enqueue document ingestion asynchronously
    ingestionQueue.enqueue({
      documentId: doc.id,
      name: doc.name,
      mimeType: doc.mimeType,
      storageKey: doc.storageKey
    });

    return toPublic(doc);
  },

  /** Active (non-trashed) documents for a user, optionally filtered by kind. */
  async list(ownerId: string, kind?: DocumentKind): Promise<PublicDocument[]> {
    const docs = await prisma.document.findMany({
      where: {
        ownerId,
        deletedAt: null,
        workspaceFiles: {
          none: {
            deletedAt: null
          }
        },
        ...(kind ? { kind } : {})
      },
      orderBy: { createdAt: 'desc' },
    });
    return docs.map(toPublic);
  },

  /** Trashed documents for a user, newest deletions first. */
  async listTrash(ownerId: string): Promise<PublicDocument[]> {
    const docs = await prisma.document.findMany({
      where: { ownerId, deletedAt: { not: null } },
      orderBy: { deletedAt: 'desc' },
    });
    return docs.map(toPublic);
  },

  /** Fetches an owned document row (for streaming/linking). */
  async getOwned(
    ownerId: string,
    id: string,
    opts: { includeTrashed?: boolean } = {},
  ): Promise<DocumentRow> {
    const doc = await prisma.document.findFirst({
      where: { id, ownerId, ...(opts.includeTrashed ? {} : { deletedAt: null }) },
    });
    if (!doc) throw ApiError.notFound('Document not found');
    return doc;
  },

  /**
   * Fetches a document the user is allowed to read: they own it, it was shared
   * with them directly, or it lives in a workspace they belong to.
   */
  async getAccessible(userId: string, id: string): Promise<DocumentRow> {
    const doc = await prisma.document.findFirst({ where: { id, deletedAt: null } });
    if (!doc) throw ApiError.notFound('Document not found');
    if (doc.ownerId === userId) return doc;

    const share = await prisma.documentShare.findFirst({
      where: { documentId: id, sharedWithId: userId },
    });
    if (share) return doc;

    const viaWorkspace = await prisma.workspaceFile.findFirst({
      where: { documentId: id, deletedAt: null, workspace: { members: { some: { userId } } } },
    });
    if (viaWorkspace) return doc;

    throw ApiError.forbidden('You do not have access to this file');
  },

  /** Moves a document to Trash (soft delete). */
  async softDelete(ownerId: string, id: string): Promise<void> {
    await documentService.getOwned(ownerId, id);
    await prisma.document.update({ where: { id }, data: { deletedAt: new Date() } });
  },

  /** Restores a trashed document. */
  async restore(ownerId: string, id: string): Promise<PublicDocument> {
    await documentService.getOwned(ownerId, id, { includeTrashed: true });
    const doc = await prisma.document.update({ where: { id }, data: { deletedAt: null } });
    return toPublic(doc);
  },

  /** Permanently removes a document row and its file from disk. */
  async permanentDelete(ownerId: string, id: string): Promise<void> {
    const doc = await documentService.getOwned(ownerId, id, { includeTrashed: true });
    await prisma.document.delete({ where: { id } });
    await removeFile(doc.storageKey);
  },

  /** Deletes documents trashed longer than the retention window. */
  async purgeExpired(retentionDays: number): Promise<number> {
    const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
    const expired = await prisma.document.findMany({
      where: { deletedAt: { lte: cutoff } },
      select: { id: true, storageKey: true },
    });
    if (!expired.length) return 0;
    await prisma.document.deleteMany({ where: { id: { in: expired.map((d) => d.id) } } });
    await Promise.all(expired.map((d) => removeFile(d.storageKey)));
    return expired.length;
  },
};
