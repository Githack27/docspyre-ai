import { randomBytes } from 'node:crypto';
import { prisma } from '../../db/prisma';
import {
  UserStatus,
  WorkspaceRole,
  type Prisma,
} from '@docspyre/database';
import { ApiError } from '../../utils/api-error';
import { documentService } from '../documents/document.service';
import type { AddFileInput, CreateWorkspaceInput } from './workspace.validation';
import type {
  PublicFile,
  PublicMember,
  PublicWorkspaceDetail,
  PublicWorkspaceSummary,
} from './workspace.types';

/* ----------------------------- helpers -------------------------------- */

/** Builds a URL-safe slug base from a name. */
const slugify = (name: string): string =>
  name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'project';

/** Generates a slug guaranteed unique against existing workspaces. */
const uniqueSlug = async (name: string): Promise<string> => {
  const base = slugify(name);
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const slug = `${base}-${randomBytes(3).toString('hex')}`;
    const existing = await prisma.workspace.findUnique({ where: { slug } });
    if (!existing) return slug;
  }
  // Extremely unlikely fall-through: use a longer random tail.
  return `${base}-${randomBytes(6).toString('hex')}`;
};

const memberInclude = {
  members: {
    include: { user: { select: { id: true, email: true, firstName: true, lastName: true } } },
    orderBy: { createdAt: 'asc' },
  },
  files: {
    where: { deletedAt: null },
    orderBy: { createdAt: 'desc' },
  },
} satisfies Prisma.WorkspaceInclude;

type WorkspaceWithRelations = Prisma.WorkspaceGetPayload<{ include: typeof memberInclude }>;

const toMember = (m: WorkspaceWithRelations['members'][number]): PublicMember => ({
  userId: m.user.id,
  email: m.user.email,
  firstName: m.user.firstName,
  lastName: m.user.lastName,
  role: m.role,
});

const toFile = (f: WorkspaceWithRelations['files'][number]): PublicFile => ({
  id: f.id,
  name: f.name,
  kind: f.kind,
  sizeBytes: f.sizeBytes,
  uploadedById: f.uploadedById,
  documentId: f.documentId,
  createdAt: f.createdAt,
});

const toDetail = (ws: WorkspaceWithRelations, userId: string): PublicWorkspaceDetail => ({
  id: ws.id,
  name: ws.name,
  slug: ws.slug,
  ownerId: ws.ownerId,
  role: ws.members.find((m) => m.userId === userId)?.role ?? WorkspaceRole.VIEWER,
  members: ws.members.map(toMember),
  files: ws.files.map(toFile),
  createdAt: ws.createdAt,
  updatedAt: ws.updatedAt,
});

/* ----------------------------- service -------------------------------- */

export const workspaceService = {
  /** Creates a workspace owned by the caller and invites registered members. */
  async create(ownerId: string, input: CreateWorkspaceInput): Promise<PublicWorkspaceDetail> {
    // Resolve invited emails to active, registered users — and never the owner.
    const invitedEmails = Array.from(new Set(input.memberEmails));
    const invitees = invitedEmails.length
      ? await prisma.user.findMany({
          where: {
            emailNormalized: { in: invitedEmails },
            status: UserStatus.ACTIVE,
            deletedAt: null,
            id: { not: ownerId },
          },
          select: { id: true },
        })
      : [];

    const slug = await uniqueSlug(input.name);

    const workspace = await prisma.$transaction(async (tx) => {
      const created = await tx.workspace.create({
        data: {
          name: input.name,
          slug,
          ownerId,
          members: {
            create: [
              { userId: ownerId, role: WorkspaceRole.OWNER },
              ...invitees.map((u) => ({ userId: u.id, role: WorkspaceRole.MEMBER })),
            ],
          },
        },
        include: memberInclude,
      });
      return created;
    });

    return toDetail(workspace, ownerId);
  },

  /** Lists workspaces the user belongs to, newest activity first. */
  async listForUser(userId: string): Promise<PublicWorkspaceSummary[]> {
    const memberships = await prisma.workspaceMember.findMany({
      where: { userId, workspace: { deletedAt: null } },
      include: {
        workspace: {
          include: { _count: { select: { members: true, files: { where: { deletedAt: null } } } } },
        },
      },
      orderBy: { workspace: { updatedAt: 'desc' } },
    });

    return memberships.map(({ role, workspace }) => ({
      id: workspace.id,
      name: workspace.name,
      slug: workspace.slug,
      role,
      memberCount: workspace._count.members,
      fileCount: workspace._count.files,
      createdAt: workspace.createdAt,
      updatedAt: workspace.updatedAt,
    }));
  },

  /** Full detail of a single workspace (membership already enforced). */
  async getDetail(workspaceId: string, userId: string): Promise<PublicWorkspaceDetail> {
    const workspace = await prisma.workspace.findFirst({
      where: { id: workspaceId, deletedAt: null },
      include: memberInclude,
    });
    if (!workspace) throw ApiError.notFound('Project not found');
    return toDetail(workspace, userId);
  },

  /** Adds a file (metadata) to a workspace and bumps its activity time. */
  async addFile(workspaceId: string, userId: string, input: AddFileInput): Promise<PublicFile> {
    const [file] = await prisma.$transaction([
      prisma.workspaceFile.create({
        data: {
          workspaceId,
          uploadedById: userId,
          name: input.name,
          kind: input.kind ?? null,
          sizeBytes: input.sizeBytes ?? null,
        },
      }),
      prisma.workspace.update({
        where: { id: workspaceId },
        data: { updatedAt: new Date() },
      }),
    ]);
    return toFile(file);
  },

  /** Links an existing owned document into a workspace as a file. */
  async linkDocument(workspaceId: string, userId: string, documentId: string): Promise<PublicFile> {
    const doc = await prisma.document.findFirst({
      where: { id: documentId, ownerId: userId, deletedAt: null },
    });
    if (!doc) throw ApiError.notFound('Document not found');

    const [file] = await prisma.$transaction([
      prisma.workspaceFile.create({
        data: {
          workspaceId,
          uploadedById: userId,
          documentId: doc.id,
          name: doc.name,
          kind: doc.mimeType,
          sizeBytes: doc.sizeBytes,
        },
      }),
      prisma.workspace.update({
        where: { id: workspaceId },
        data: { updatedAt: new Date() },
      }),
    ]);
    return toFile(file);
  },

  /** Uploads a new file into the owner's library and links it to a workspace. */
  async uploadFile(
    workspaceId: string,
    userId: string,
    input: { originalName: string; mimeType: string; buffer: Buffer },
  ): Promise<PublicFile> {
    const doc = await documentService.create(userId, input);
    return workspaceService.linkDocument(workspaceId, userId, doc.id);
  },

  /** Lists a workspace's active files. */
  async listFiles(workspaceId: string): Promise<PublicFile[]> {
    const files = await prisma.workspaceFile.findMany({
      where: { workspaceId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    return files.map(toFile);
  },

  /** Soft-deletes a file from a workspace and bumps its activity time. */
  async deleteFile(workspaceId: string, fileId: string): Promise<void> {
    const file = await prisma.workspaceFile.findFirst({
      where: { id: fileId, workspaceId, deletedAt: null },
    });
    if (!file) throw ApiError.notFound('File not found');

    await prisma.$transaction([
      prisma.workspaceFile.update({
        where: { id: fileId },
        data: { deletedAt: new Date() },
      }),
      prisma.workspace.update({
        where: { id: workspaceId },
        data: { updatedAt: new Date() },
      }),
    ]);
  },
};
