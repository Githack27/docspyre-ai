export interface PublicMember {
  userId: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  role: string;
}

export interface PublicFile {
  id: string;
  name: string;
  kind: string | null;
  sizeBytes: number | null;
  uploadedById: string | null;
  documentId: string | null;
  createdAt: Date;
}

export interface PublicWorkspaceSummary {
  id: string;
  name: string;
  slug: string;
  role: string;
  memberCount: number;
  fileCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface PublicWorkspaceDetail {
  id: string;
  name: string;
  slug: string;
  ownerId: string;
  role: string;
  members: PublicMember[];
  files: PublicFile[];
  createdAt: Date;
  updatedAt: Date;
}
