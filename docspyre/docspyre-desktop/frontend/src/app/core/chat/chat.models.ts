export interface ChatCitation {
  index: number;
  chunk_id: string;
  document_id: string;
  page: number;
  bbox?: number[];
  section_path?: string[];
  type?: 'document' | 'web';
  url?: string;
  title?: string;
  marker?: string;
}

export interface ChatMessage {
  id: string;
  sessionId: string;
  senderId: string | null;
  role: 'user' | 'assistant' | 'system';
  content: string;
  citations?: ChatCitation[];
  createdAt: string;
}

export interface ChatSession {
  id: string;
  title: string;
  userId: string;
  workspaceId: string | null;
  documentId: string | null;
  workspaceFileId: string | null;
  totalTokens?: number;
  previousSessionId?: string | null;
  initialSummary?: string | null;
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
  previousSessionId?: string | null;
  initialSummary?: string | null;
}

export interface ContinueSessionResult {
  session: ChatSession;
}
