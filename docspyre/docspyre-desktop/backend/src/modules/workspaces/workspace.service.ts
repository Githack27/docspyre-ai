import { randomBytes } from 'node:crypto';
import {
  db, eq, and, ne, isNull, inArray, desc, count,
  users, workspaces, workspaceMembers, workspaceFiles, documents,
} from '@docspyre/database';
import { ApiError } from '../../core/utils/api-error';
import { requireRow } from '../../core/utils/rows';
import { documentService } from '../documents/document.service';
import type { AddFileInput, CreateWorkspaceInput } from './workspace.validation';
import type { PublicFile, PublicMember, PublicWorkspaceDetail, PublicWorkspaceSummary } from './workspace.types';

const slugify = (name: string): string =>
  name.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'project';

const uniqueSlug = async (name: string): Promise<string> => {
  const base = slugify(name);
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const slug = `${base}-${randomBytes(3).toString('hex')}`;
    const [existing] = await db.select({ id: workspaces.id }).from(workspaces).where(eq(workspaces.slug, slug)).limit(1);
    if (!existing) return slug;
  }
  return `${base}-${randomBytes(6).toString('hex')}`;
};

export const workspaceService = {
  async create(ownerId: string, input: CreateWorkspaceInput): Promise<PublicWorkspaceDetail> {
    const invitedEmails = Array.from(new Set(input.memberEmails));
    const invitees = invitedEmails.length
      ? await db
          .select({ id: users.id })
          .from(users)
          .where(
            and(
              inArray(users.emailNormalized, invitedEmails),
              eq(users.status, 'ACTIVE'),
              isNull(users.deletedAt),
              ne(users.id, ownerId),
            ),
          )
      : [];

    const slug = await uniqueSlug(input.name);

    const workspace = requireRow(
      await db.insert(workspaces).values({ name: input.name, slug, ownerId }).returning(),
      'workspace insert',
    );

    // Insert members
    const memberValues = [
      { workspaceId: workspace.id, userId: ownerId, role: 'OWNER' as const },
      ...invitees.map((u) => ({ workspaceId: workspace.id, userId: u.id, role: 'MEMBER' as const })),
    ];
    await db.insert(workspaceMembers).values(memberValues);

    return workspaceService.getDetail(workspace.id, ownerId);
  },

  async listForUser(userId: string): Promise<PublicWorkspaceSummary[]> {
    const memberships = await db
      .select({
        role: workspaceMembers.role,
        workspaceId: workspaceMembers.workspaceId,
      })
      .from(workspaceMembers)
      .innerJoin(workspaces, eq(workspaceMembers.workspaceId, workspaces.id))
      .where(and(eq(workspaceMembers.userId, userId), isNull(workspaces.deletedAt)))
      .orderBy(desc(workspaces.updatedAt));

    const results: PublicWorkspaceSummary[] = [];

    for (const m of memberships) {
      const [ws] = await db.select().from(workspaces).where(eq(workspaces.id, m.workspaceId)).limit(1);
      if (!ws) continue;

      const [memberCount] = await db.select({ count: count() }).from(workspaceMembers).where(eq(workspaceMembers.workspaceId, ws.id));
      const [fileCount] = await db.select({ count: count() }).from(workspaceFiles).where(and(eq(workspaceFiles.workspaceId, ws.id), isNull(workspaceFiles.deletedAt)));

      results.push({
        id: ws.id,
        name: ws.name,
        slug: ws.slug,
        role: m.role,
        memberCount: memberCount?.count ?? 0,
        fileCount: fileCount?.count ?? 0,
        createdAt: ws.createdAt,
        updatedAt: ws.updatedAt,
      });
    }

    return results;
  },

  async getDetail(workspaceId: string, userId: string): Promise<PublicWorkspaceDetail> {
    const [ws] = await db
      .select()
      .from(workspaces)
      .where(and(eq(workspaces.id, workspaceId), isNull(workspaces.deletedAt)))
      .limit(1);
    if (!ws) throw ApiError.notFound('Project not found');

    const members = await db
      .select({
        userId: workspaceMembers.userId,
        role: workspaceMembers.role,
        email: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
      })
      .from(workspaceMembers)
      .innerJoin(users, eq(workspaceMembers.userId, users.id))
      .where(eq(workspaceMembers.workspaceId, workspaceId));

    const files = await db
      .select()
      .from(workspaceFiles)
      .where(and(eq(workspaceFiles.workspaceId, workspaceId), isNull(workspaceFiles.deletedAt)))
      .orderBy(desc(workspaceFiles.createdAt));

    const callerMember = members.find((m) => m.userId === userId);

    return {
      id: ws.id,
      name: ws.name,
      slug: ws.slug,
      ownerId: ws.ownerId,
      role: callerMember?.role ?? 'VIEWER',
      members: members.map((m): PublicMember => ({
        userId: m.userId,
        email: m.email,
        firstName: m.firstName,
        lastName: m.lastName,
        role: m.role,
      })),
      files: files.map((f): PublicFile => ({
        id: f.id,
        name: f.name,
        kind: f.kind,
        sizeBytes: f.sizeBytes,
        uploadedById: f.uploadedById,
        documentId: f.documentId,
        createdAt: f.createdAt,
      })),
      createdAt: ws.createdAt,
      updatedAt: ws.updatedAt,
    };
  },

  async addFile(workspaceId: string, userId: string, input: AddFileInput): Promise<PublicFile> {
    const file = requireRow(
      await db
        .insert(workspaceFiles)
        .values({
          workspaceId,
          uploadedById: userId,
          name: input.name,
          kind: input.kind ?? null,
          sizeBytes: input.sizeBytes ?? null,
        })
        .returning(),
      'workspace file insert',
    );

    await db.update(workspaces).set({ updatedAt: new Date() }).where(eq(workspaces.id, workspaceId));

    return { id: file.id, name: file.name, kind: file.kind, sizeBytes: file.sizeBytes, uploadedById: file.uploadedById, documentId: file.documentId, createdAt: file.createdAt };
  },

  async linkDocument(workspaceId: string, userId: string, documentId: string): Promise<PublicFile> {
    const [doc] = await db
      .select()
      .from(documents)
      .where(and(eq(documents.id, documentId), eq(documents.ownerId, userId), isNull(documents.deletedAt)))
      .limit(1);
    if (!doc) throw ApiError.notFound('Document not found');

    const file = requireRow(
      await db
        .insert(workspaceFiles)
        .values({
          workspaceId,
          uploadedById: userId,
          documentId: doc.id,
          name: doc.name,
          kind: doc.mimeType,
          sizeBytes: doc.sizeBytes,
        })
        .returning(),
      'workspace file link',
    );

    await db.update(workspaces).set({ updatedAt: new Date() }).where(eq(workspaces.id, workspaceId));

    return { id: file.id, name: file.name, kind: file.kind, sizeBytes: file.sizeBytes, uploadedById: file.uploadedById, documentId: file.documentId, createdAt: file.createdAt };
  },

  async uploadFile(workspaceId: string, userId: string, input: { originalName: string; mimeType: string; buffer: Buffer }): Promise<PublicFile> {
    const doc = await documentService.create(userId, input);
    return workspaceService.linkDocument(workspaceId, userId, doc.id);
  },

  async listFiles(workspaceId: string): Promise<PublicFile[]> {
    const files = await db
      .select()
      .from(workspaceFiles)
      .where(and(eq(workspaceFiles.workspaceId, workspaceId), isNull(workspaceFiles.deletedAt)))
      .orderBy(desc(workspaceFiles.createdAt));
    return files.map((f) => ({ id: f.id, name: f.name, kind: f.kind, sizeBytes: f.sizeBytes, uploadedById: f.uploadedById, documentId: f.documentId, createdAt: f.createdAt }));
  },

  async deleteFile(workspaceId: string, fileId: string): Promise<void> {
    const [file] = await db
      .select()
      .from(workspaceFiles)
      .where(and(eq(workspaceFiles.id, fileId), eq(workspaceFiles.workspaceId, workspaceId), isNull(workspaceFiles.deletedAt)))
      .limit(1);
    if (!file) throw ApiError.notFound('File not found');

    await db.update(workspaceFiles).set({ deletedAt: new Date() }).where(eq(workspaceFiles.id, fileId));
    await db.update(workspaces).set({ updatedAt: new Date() }).where(eq(workspaces.id, workspaceId));
  },
};
