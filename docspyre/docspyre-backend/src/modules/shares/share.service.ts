import { prisma } from '../../db/prisma';
import { SharePermission, UserStatus } from '@docspyre/database';
import { ApiError } from '../../utils/api-error';
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
  /** Shares an owned document with a set of registered users. */
  async share(
    ownerId: string,
    documentId: string,
    userIds: string[],
    permission: SharePermission,
  ): Promise<ShareRecipient[]> {
    const doc = await prisma.document.findFirst({
      where: { id: documentId, ownerId, deletedAt: null },
    });
    if (!doc) throw ApiError.notFound('Document not found');

    const recipients = await prisma.user.findMany({
      where: {
        id: { in: Array.from(new Set(userIds)).filter((id) => id !== ownerId) },
        status: UserStatus.ACTIVE,
        deletedAt: null,
      },
      select: { id: true, email: true, firstName: true, lastName: true },
    });
    if (!recipients.length) throw ApiError.badRequest('No valid recipients found');

    await prisma.$transaction(
      recipients.map((r) =>
        prisma.documentShare.upsert({
          where: { documentId_sharedWithId: { documentId, sharedWithId: r.id } },
          create: { documentId, sharedById: ownerId, sharedWithId: r.id, permission },
          update: { permission },
        }),
      ),
    );

    return recipients.map((r) => ({ ...toUser(r), permission }));
  },

  /** Lists who a document is currently shared with (owner only). */
  async listRecipients(ownerId: string, documentId: string): Promise<ShareRecipient[]> {
    const doc = await prisma.document.findFirst({ where: { id: documentId, ownerId } });
    if (!doc) throw ApiError.notFound('Document not found');

    const shares = await prisma.documentShare.findMany({
      where: { documentId },
      include: { sharedWith: { select: { id: true, email: true, firstName: true, lastName: true } } },
      orderBy: { createdAt: 'asc' },
    });
    return shares.map((s) => ({ ...toUser(s.sharedWith), permission: s.permission }));
  },

  /** Revokes a single recipient's access to an owned document. */
  async revoke(ownerId: string, documentId: string, userId: string): Promise<void> {
    const doc = await prisma.document.findFirst({ where: { id: documentId, ownerId } });
    if (!doc) throw ApiError.notFound('Document not found');
    await prisma.documentShare.deleteMany({ where: { documentId, sharedWithId: userId } });
  },

  /** Files shared with the user: direct shares + files in shared projects. */
  async listSharedWithMe(userId: string): Promise<IncomingShare[]> {
    const direct = await prisma.documentShare.findMany({
      where: { sharedWithId: userId, document: { deletedAt: null } },
      include: {
        document: true,
        sharedBy: { select: { id: true, email: true, firstName: true, lastName: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const directItems: IncomingShare[] = direct.map((s) => ({
      id: s.id,
      source: 'DIRECT',
      documentId: s.documentId,
      name: s.document.name,
      mimeType: s.document.mimeType,
      sizeBytes: s.document.sizeBytes,
      permission: s.permission,
      from: toUser(s.sharedBy),
      projectName: null,
      sharedAt: s.createdAt,
    }));

    const projectFiles = await prisma.workspaceFile.findMany({
      where: {
        deletedAt: null,
        documentId: { not: null },
        uploadedById: { not: userId },
        workspace: {
          deletedAt: null,
          members: { some: { userId } },
        },
      },
      include: {
        uploadedBy: { select: { id: true, email: true, firstName: true, lastName: true } },
        workspace: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const projectItems: IncomingShare[] = projectFiles
      .filter((f) => f.uploadedBy)
      .map((f) => ({
        id: f.id,
        source: 'PROJECT',
        documentId: f.documentId,
        name: f.name,
        mimeType: f.kind ?? 'application/octet-stream',
        sizeBytes: f.sizeBytes ?? 0,
        permission: SharePermission.DOWNLOAD,
        from: toUser(f.uploadedBy!),
        projectName: f.workspace.name,
        sharedAt: f.createdAt,
      }));

    return [...directItems, ...projectItems].sort(
      (a, b) => b.sharedAt.getTime() - a.sharedAt.getTime(),
    );
  },

  /** Files the user is sharing: direct shares + files in projects they own. */
  async listSharedByMe(userId: string): Promise<OutgoingShare[]> {
    const direct = await prisma.documentShare.findMany({
      where: { sharedById: userId, document: { deletedAt: null } },
      include: {
        document: true,
        sharedWith: { select: { id: true, email: true, firstName: true, lastName: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const byDocument = new Map<string, OutgoingShare>();
    for (const s of direct) {
      const existing = byDocument.get(s.documentId);
      const recipient: ShareRecipient = { ...toUser(s.sharedWith), permission: s.permission };
      if (existing) {
        existing.recipients.push(recipient);
      } else {
        byDocument.set(s.documentId, {
          id: s.documentId,
          source: 'DIRECT',
          documentId: s.documentId,
          name: s.document.name,
          mimeType: s.document.mimeType,
          sizeBytes: s.document.sizeBytes,
          recipients: [recipient],
          projectName: null,
          sharedAt: s.createdAt,
        });
      }
    }

    const uploadedFiles = await prisma.workspaceFile.findMany({
      where: {
        deletedAt: null,
        documentId: { not: null },
        uploadedById: userId,
        workspace: {
          deletedAt: null,
          members: { some: { userId: { not: userId } } },
        },
      },
      include: {
        workspace: {
          include: {
            members: {
              where: { userId: { not: userId } },
              include: { user: { select: { id: true, email: true, firstName: true, lastName: true } } },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const projectItems: OutgoingShare[] = uploadedFiles.map((f) => ({
      id: f.id,
      source: 'PROJECT',
      documentId: f.documentId,
      name: f.name,
      mimeType: f.kind ?? 'application/octet-stream',
      sizeBytes: f.sizeBytes ?? 0,
      recipients: f.workspace.members.map((m) => ({
        ...toUser(m.user),
        permission: SharePermission.DOWNLOAD,
      })),
      projectName: f.workspace.name,
      sharedAt: f.createdAt,
    }));

    return [...byDocument.values(), ...projectItems].sort(
      (a, b) => b.sharedAt.getTime() - a.sharedAt.getTime(),
    );
  },
};
