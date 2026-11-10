export interface ShareUser {
  id: string;
  email: string;
  name: string;
}

export interface ShareRecipient extends ShareUser {
  permission: string;
}

export interface IncomingShare {
  id: string;
  source: 'DIRECT' | 'PROJECT';
  documentId: string | null;
  name: string;
  mimeType: string;
  sizeBytes: number;
  permission: string;
  from: ShareUser;
  projectName: string | null;
  sharedAt: Date;
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
  sharedAt: Date;
}
