export type SharePermission = 'VIEW' | 'DOWNLOAD';

export interface ShareUser {
  id: string;
  name: string;
  email: string;
}

export interface ShareRecipient extends ShareUser {
  permission: SharePermission;
}

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
  sharedAt: string;
}

export interface OutgoingShare {
  id: string;
  source: 'DIRECT' | 'PROJECT';
  documentId: string | null;
  name: string;
  mimeType: string;
  sizeBytes: number;
  recipients: ShareRecipient[];
  projectName: string | null;
  sharedAt: string;
}
