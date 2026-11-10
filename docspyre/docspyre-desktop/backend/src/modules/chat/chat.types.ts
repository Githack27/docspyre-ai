export interface PublicChatMessage {
  id: string;
  sessionId: string;
  senderId: string | null;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt: Date;
}

export interface PublicChatSession {
  id: string;
  title: string;
  userId: string;
  workspaceId: string | null;
  documentId: string | null;
  workspaceFileId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface PublicChatSessionDetail extends PublicChatSession {
  messages: PublicChatMessage[];
}
