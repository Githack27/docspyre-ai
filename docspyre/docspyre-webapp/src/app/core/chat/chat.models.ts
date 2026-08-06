export interface ChatMessage {
  id: string;
  sessionId: string;
  senderId: string | null;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt: string;
}

export interface ChatSession {
  id: string;
  title: string;
  userId: string;
  workspaceId: string | null;
  documentId: string | null;
  workspaceFileId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ChatSessionDetail extends ChatSession {
  messages: ChatMessage[];
}

export interface CreateChatSessionInput {
  title: string;
  documentId?: string | null;
  workspaceId?: string | null;
  workspaceFileId?: string | null;
}
