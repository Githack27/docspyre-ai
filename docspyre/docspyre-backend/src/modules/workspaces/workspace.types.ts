import type { WorkspaceRole } from '@docspyre/database';

/** A member of a workspace, flattened with the user's public details. */
export interface PublicMember {
  userId: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  role: WorkspaceRole;
}

/** A file attached to a workspace (metadata + optional document link). */
export interface PublicFile {
  id: string;
  name: string;
  kind: string | null;
  sizeBytes: number | null;
  uploadedById: string | null;
  documentId: string | null;
  createdAt: Date;
}

/** Lightweight workspace row for the grid listing. */
export interface PublicWorkspaceSummary {
  id: string;
  name: string;
  slug: string;
  role: WorkspaceRole;
  memberCount: number;
  fileCount: number;
  createdAt: Date;
  updatedAt: Date;
}

/** Full workspace view used inside an opened project. */
export interface PublicWorkspaceDetail {
  id: string;
  name: string;
  slug: string;
  ownerId: string;
  role: WorkspaceRole;
  members: PublicMember[];
  files: PublicFile[];
  createdAt: Date;
  updatedAt: Date;
}
