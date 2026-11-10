import {
  db, eq, and, ne, isNull, isNotNull, inArray, desc,
  users, documents, documentShares, workspaceFiles, workspaces, workspaceMembers,
} from '@docspyre/database';
import { ApiError } from '../../core/utils/api-error';
import type { IncomingShare, OutgoingShare, ShareRecipient, ShareUser } from './share.types';

interface NamedUser {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
}

const toUser = (u: NamedUser): ShareUser => ({
  id: u.id,
  email: u.email,
  name: [u.firstName, u.lastName].filter(Boolean).join(' ').trim() || u.email,
});

export const shareService = {
  async share(ownerId: string, documentId: string, userIds: string[], permission: 'VIEW' | 'DOWNLOAD'): Promise<ShareRecipient[]> {
    const [doc] = await db.select().from(documents).where(and(eq(documents.id, documentId), eq(documents.ownerId, ownerId), isNull(documents.deletedAt))).limit(1);
    if (!doc) throw ApiError.notFound('Document not found');

    const uniqueIds = Array.from(new Set(userIds)).filter((id) => id !== ownerId);
    const recipients = await db
      .select({ id: users.id, email: users.email, firstName: users.firstName, lastName: users.lastName })
      .from(users)
      .where(and(inArray(users.id, uniqueIds), eq(users.status, 'ACTIVE'), isNull(users.deletedAt)));

    if (!recipients.length) throw ApiError.badRequest('No valid recipients found');

    for (const r of recipients) {
      await db
        .insert(documentShares)
        .values({ documentId, sharedById: ownerId, sharedWithId: r.id, permission })
        .onConflictDoUpdate({
          target: [documentShares.documentId, documentShares.sharedWithId],
          set: { permission },
        });
    }

    return recipients.map((r) => ({ ...toUser(r), permission }));
  },

  async listRecipients(ownerId: string, documentId: string): Promise<ShareRecipient[]> {
    const [doc] = await db.select().from(documents).where(and(eq(documents.id, documentId), eq(documents.ownerId, ownerId))).limit(1);
    if (!doc) throw ApiError.notFound('Document not found');

    const shares = await db
      .select({
        permission: documentShares.permission,
        id: users.id,
        email: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
      })
      .from(documentShares)
      .innerJoin(users, eq(documentShares.sharedWithId, users.id))
      .where(eq(documentShares.documentId, documentId));

    return shares.map((s) => ({ ...toUser(s), permission: s.permission }));
  },

  async revoke(ownerId: string, documentId: string, userId: string): Promise<void> {
    const [doc] = await db.select().from(documents).where(and(eq(documents.id, documentId), eq(documents.ownerId, ownerId))).limit(1);
    if (!doc) throw ApiError.notFound('Document not found');
    await db.delete(documentShares).where(and(eq(documentShares.documentId, documentId), eq(documentShares.sharedWithId, userId)));
  },

  async listSharedWithMe(userId: string): Promise<IncomingShare[]> {
    // Direct shares
    const directRows = await db
      .select({
        shareId: documentShares.id,
        documentId: documentShares.documentId,
        permission: documentShares.permission,
        sharedAt: documentShares.createdAt,
        docName: documents.name,
        docMimeType: documents.mimeType,
        docSizeBytes: documents.sizeBytes,
        fromId: users.id,
        fromEmail: users.email,
        fromFirstName: users.firstName,
        fromLastName: users.lastName,
      })
      .from(documentShares)
      .innerJoin(documents, eq(documentShares.documentId, documents.id))
      .innerJoin(users, eq(documentShares.sharedById, users.id))
      .where(and(eq(documentShares.sharedWithId, userId), isNull(documents.deletedAt)))
      .orderBy(desc(documentShares.createdAt));

    const directItems: IncomingShare[] = directRows.map((r) => ({
      id: r.shareId,
      source: 'DIRECT',
      documentId: r.documentId,
      name: r.docName,
      mimeType: r.docMimeType,
      sizeBytes: r.docSizeBytes,
      permission: r.permission,
      from: toUser({ id: r.fromId, email: r.fromEmail, firstName: r.fromFirstName, lastName: r.fromLastName }),
      projectName: null,
      sharedAt: r.sharedAt,
    }));

    // Project files shared via workspace membership
    const projectRows = await db
      .select({
        fileId: workspaceFiles.id,
        documentId: workspaceFiles.documentId,
        name: workspaceFiles.name,
        kind: workspaceFiles.kind,
        sizeBytes: workspaceFiles.sizeBytes,
        createdAt: workspaceFiles.createdAt,
        workspaceName: workspaces.name,
        uploaderId: users.id,
        uploaderEmail: users.email,
        uploaderFirstName: users.firstName,
        uploaderLastName: users.lastName,
      })
      .from(workspaceFiles)
      .innerJoin(workspaces, eq(workspaceFiles.workspaceId, workspaces.id))
      .innerJoin(workspaceMembers, eq(workspaceFiles.workspaceId, workspaceMembers.workspaceId))
      .innerJoin(users, eq(workspaceFiles.uploadedById, users.id))
      .where(
        and(
          eq(workspaceMembers.userId, userId),
          isNull(workspaceFiles.deletedAt),
          isNull(workspaces.deletedAt),
          isNotNull(workspaceFiles.documentId),
          ne(workspaceFiles.uploadedById, userId),
        ),
      )
      .orderBy(desc(workspaceFiles.createdAt));

    const projectItems: IncomingShare[] = projectRows.map((r) => ({
      id: r.fileId,
      source: 'PROJECT',
      documentId: r.documentId,
      name: r.name,
      mimeType: r.kind ?? 'application/octet-stream',
      sizeBytes: r.sizeBytes ?? 0,
      permission: 'DOWNLOAD',
      from: toUser({ id: r.uploaderId, email: r.uploaderEmail, firstName: r.uploaderFirstName, lastName: r.uploaderLastName }),
      projectName: r.workspaceName,
      sharedAt: r.createdAt,
    }));

    return [...directItems, ...projectItems].sort((a, b) => b.sharedAt.getTime() - a.sharedAt.getTime());
  },

  async listSharedByMe(userId: string): Promise<OutgoingShare[]> {
    const directRows = await db
      .select({
        documentId: documentShares.documentId,
        permission: documentShares.permission,
        sharedAt: documentShares.createdAt,
        docName: documents.name,
        docMimeType: documents.mimeType,
        docSizeBytes: documents.sizeBytes,
        recipientId: users.id,
        recipientEmail: users.email,
        recipientFirstName: users.firstName,
        recipientLastName: users.lastName,
      })
      .from(documentShares)
      .innerJoin(documents, eq(documentShares.documentId, documents.id))
      .innerJoin(users, eq(documentShares.sharedWithId, users.id))
      .where(and(eq(documentShares.sharedById, userId), isNull(documents.deletedAt)))
      .orderBy(desc(documentShares.createdAt));

    const byDocument = new Map<string, OutgoingShare>();
    for (const r of directRows) {
      const recipient: ShareRecipient = {
        ...toUser({ id: r.recipientId, email: r.recipientEmail, firstName: r.recipientFirstName, lastName: r.recipientLastName }),
        permission: r.permission,
      };
      const existing = byDocument.get(r.documentId);
      if (existing) {
        existing.recipients.push(recipient);
      } else {
        byDocument.set(r.documentId, {
          id: r.documentId,
          source: 'DIRECT',
          documentId: r.documentId,
          name: r.docName,
          mimeType: r.docMimeType,
          sizeBytes: r.docSizeBytes,
          recipients: [recipient],
          projectName: null,
          sharedAt: r.sharedAt,
        });
      }
    }

    return [...byDocument.values()];
  },
};
