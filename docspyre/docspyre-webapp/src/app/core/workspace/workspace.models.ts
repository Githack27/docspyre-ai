export type WorkspaceRole = 'OWNER' | 'ADMIN' | 'MEMBER' | 'VIEWER';


export interface UserLite {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
}

export interface ProjectMember {
  userId: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  role: WorkspaceRole;
}

export interface ProjectFile {
  id: string;
  name: string;
  kind: string | null;
  sizeBytes: number | null;
  uploadedById: string | null;
  documentId: string | null;
  createdAt: string;
}


export interface ProjectSummary {
  id: string;
  name: string;
  slug: string;
  role: WorkspaceRole;
  memberCount: number;
  fileCount: number;
  createdAt: string;
  updatedAt: string;
}


export interface ProjectDetail {
  id: string;
  name: string;
  slug: string;
  ownerId: string;
  role: WorkspaceRole;
  members: ProjectMember[];
  files: ProjectFile[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateProjectPayload {
  name: string;
  memberEmails: string[];
}

export interface AddFilePayload {
  name: string;
  kind?: string;
  sizeBytes?: number;
}
