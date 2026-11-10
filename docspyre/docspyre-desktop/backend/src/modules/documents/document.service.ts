import {
  db, eq, and, isNull, isNotNull, lte, inArray, desc,
  documents, workspaceFiles, documentShares, workspaceMembers,
} from '@docspyre/database';
import type { InferSelectModel } from '@docspyre/database';
import { ApiError } from '../../core/utils/api-error';
import { kindFromMime } from './document.kind';
import { removeFile, saveBuffer } from './document.storage';
import type { PublicDocument } from './document.types';
import { requireRow } from '../../core/utils/rows';
import { ingestionQueue } from '../../agents/chat-document/ingestion/queue.service';

type DocumentRow = InferSelectModel<typeof documents>;

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
  async create(ownerId: string, input: CreateDocumentInput): Promise<PublicDocument> {
    const storageKey = await saveBuffer(input.originalName, input.buffer);
    const doc = requireRow(
      await db
        .insert(documents)
        .values({
          ownerId,
          name: input.originalName,
          storageKey,
          mimeType: input.mimeType || 'application/octet-stream',
          kind: kindFromMime(input.mimeType),
          sizeBytes: input.buffer.length,
        })
        .returning(),
      'document insert',
    );

    ingestionQueue.enqueue({
      documentId: doc.id,
      ownerId: doc.ownerId,
      name: doc.name,
      mimeType: doc.mimeType,
      storageKey: doc.storageKey,
    });

    return toPublic(doc);
  },

  async list(ownerId: string, kind?: string): Promise<PublicDocument[]> {
    // Get document IDs that are linked to workspaces (to exclude them)
    const linkedIds = await db
      .select({ documentId: workspaceFiles.documentId })
      .from(workspaceFiles)
      .where(and(isNull(workspaceFiles.deletedAt), isNotNull(workspaceFiles.documentId)));

    const linkedDocIds = linkedIds
      .map((r) => r.documentId)
      .filter((id): id is string => id !== null);

    let query = db
      .select()
      .from(documents)
      .where(
        and(
          eq(documents.ownerId, ownerId),
          isNull(documents.deletedAt),
          ...(kind ? [eq(documents.kind, kind as any)] : []),
          ...(linkedDocIds.length ? [/* exclude linked */ ] : []),
        ),
      )
      .orderBy(desc(documents.createdAt));

    const rows = await query;

    // Filter out linked documents in application layer for simplicity
    const filtered = linkedDocIds.length
      ? rows.filter((d) => !linkedDocIds.includes(d.id))
      : rows;

    return filtered.map(toPublic);
  },

  async listTrash(ownerId: string): Promise<PublicDocument[]> {
    const rows = await db
      .select()
      .from(documents)
      .where(and(eq(documents.ownerId, ownerId), isNotNull(documents.deletedAt)))
      .orderBy(desc(documents.deletedAt));
    return rows.map(toPublic);
  },

  async getOwned(
    ownerId: string,
    id: string,
    opts: { includeTrashed?: boolean } = {},
  ): Promise<DocumentRow> {
    const conditions = [eq(documents.id, id), eq(documents.ownerId, ownerId)];
    if (!opts.includeTrashed) {
      conditions.push(isNull(documents.deletedAt));
    }

    const [doc] = await db
      .select()
      .from(documents)
      .where(and(...conditions))
      .limit(1);

    if (!doc) throw ApiError.notFound('Document not found');
    return doc;
  },

  async getAccessible(userId: string, id: string): Promise<DocumentRow> {
    const [doc] = await db
      .select()
      .from(documents)
      .where(and(eq(documents.id, id), isNull(documents.deletedAt)))
      .limit(1);

    if (!doc) throw ApiError.notFound('Document not found');
    if (doc.ownerId === userId) return doc;

    // Check direct share
    const [share] = await db
      .select()
      .from(documentShares)
      .where(and(eq(documentShares.documentId, id), eq(documentShares.sharedWithId, userId)))
      .limit(1);
    if (share) return doc;

    // Check workspace membership
    const [viaWorkspace] = await db
      .select()
      .from(workspaceFiles)
      .innerJoin(workspaceMembers, eq(workspaceFiles.workspaceId, workspaceMembers.workspaceId))
      .where(
        and(
          eq(workspaceFiles.documentId, id),
          isNull(workspaceFiles.deletedAt),
          eq(workspaceMembers.userId, userId),
        ),
      )
      .limit(1);
    if (viaWorkspace) return doc;

    throw ApiError.forbidden('You do not have access to this file');
  },

  async softDelete(ownerId: string, id: string): Promise<void> {
    await documentService.getOwned(ownerId, id);
    await db
      .update(documents)
      .set({ deletedAt: new Date() })
      .where(eq(documents.id, id));
  },

  async restore(ownerId: string, id: string): Promise<PublicDocument> {
    await documentService.getOwned(ownerId, id, { includeTrashed: true });
    const doc = requireRow(
      await db
        .update(documents)
        .set({ deletedAt: null })
        .where(eq(documents.id, id))
        .returning(),
      'document restore',
    );
    return toPublic(doc);
  },

  async permanentDelete(ownerId: string, id: string): Promise<void> {
    const doc = await documentService.getOwned(ownerId, id, { includeTrashed: true });
    await db.delete(documents).where(eq(documents.id, id));
    await removeFile(doc.storageKey);
  },

  async purgeExpired(retentionDays: number): Promise<number> {
    const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
    const expired = await db
      .select({ id: documents.id, storageKey: documents.storageKey })
      .from(documents)
      .where(lte(documents.deletedAt, cutoff));

    if (!expired.length) return 0;

    await db.delete(documents).where(inArray(documents.id, expired.map((d) => d.id)));
    await Promise.all(expired.map((d) => removeFile(d.storageKey)));
    return expired.length;
  },

  async reingest(userId: string, documentId: string): Promise<PublicDocument> {
    const doc = await documentService.getAccessible(userId, documentId);

    await db
      .update(documents)
      .set({ ingestionStatus: 'QUEUED', ingestionError: null })
      .where(eq(documents.id, doc.id));

    // Re-ingestion runs as the document owner so their provider config drives
    // summarisation, even when a collaborator triggered it.
    ingestionQueue.enqueue({
      documentId: doc.id,
      ownerId: doc.ownerId,
      name: doc.name,
      mimeType: doc.mimeType,
      storageKey: doc.storageKey,
    });

    const updated = requireRow(
      await db.select().from(documents).where(eq(documents.id, doc.id)).limit(1),
      'document reload after reingest',
    );

    return toPublic(updated);
  },
};
