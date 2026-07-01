import type { SharePermission } from '@docspyre/database';

export interface ShareUser {
  id: string;
  name: string;
  email: string;
}

export interface ShareRecipient extends ShareUser {
  permission: SharePermission;
}

/** A file visible to the current user because it was shared with them. */
export interface IncomingShare {
  id: string;
  source: 'DIRECT' | 'PROJECT';
  documentId: string | null;
  name: string;
  mimeType: string;
  sizeBytes: number;
  permission: SharePermission;
  from: ShareUser;
  projectName: string | null;
  sharedAt: Date;
}

/** A file the current user is sharing with others. */
export interface OutgoingShare {
  id: string;
  source: 'DIRECT' | 'PROJECT';
  documentId: string | null;
  name: string;
  mimeType: string;
  sizeBytes: number;
  recipients: ShareRecipient[];
  projectName: string | null;
  sharedAt: Date;
}
