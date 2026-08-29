import {
  db, eq, and, isNull, desc,
  chatSessions, chatMessages, workspaceMembers, documents, workspaceFiles,
} from '@docspyre/database';
import { ApiError } from '../../core/utils/api-error';
import { requireRow } from '../../core/utils/rows';

export interface PublicChatSession {
  id: string;
  title: string;
  documentId: string | null;
  workspaceId: string | null;
  workspaceFileId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface PublicChatMessage {
  id: string;
  role: string;
  content: string;
  senderId: string | null;
  createdAt: Date;
}

export interface PublicChatSessionDetail extends PublicChatSession {
  messages: PublicChatMessage[];
}

interface CreateSessionInput {
  title: string;
  documentId?: string;
  workspaceId?: string;
  workspaceFileId?: string;
}

export const chatService = {
  async createSession(userId: string, input: CreateSessionInput): Promise<PublicChatSession> {
    // Validate access
    if (input.workspaceId) {
      const [membership] = await db
        .select()
        .from(workspaceMembers)
        .where(and(eq(workspaceMembers.workspaceId, input.workspaceId), eq(workspaceMembers.userId, userId)))
        .limit(1);
      if (!membership) throw ApiError.forbidden('You are not a member of this workspace');
    }

    if (input.documentId && !input.workspaceId) {
      const [doc] = await db
        .select()
        .from(documents)
        .where(and(eq(documents.id, input.documentId), eq(documents.ownerId, userId), isNull(documents.deletedAt)))
        .limit(1);
      if (!doc) throw ApiError.notFound('Document not found');
    }

    const session = requireRow(
      await db
        .insert(chatSessions)
        .values({
          title: input.title,
          userId,
          documentId: input.documentId ?? null,
          workspaceId: input.workspaceId ?? null,
          workspaceFileId: input.workspaceFileId ?? null,
        })
        .returning(),
      'chat session insert',
    );

    return {
      id: session.id,
      title: session.title,
      documentId: session.documentId,
      workspaceId: session.workspaceId,
      workspaceFileId: session.workspaceFileId,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
    };
  },

  async listSessions(userId: string, filters?: { workspaceId?: string; documentId?: string }): Promise<PublicChatSession[]> {
    const conditions = [eq(chatSessions.userId, userId), isNull(chatSessions.deletedAt)];
    if (filters?.workspaceId) conditions.push(eq(chatSessions.workspaceId, filters.workspaceId));
    if (filters?.documentId) conditions.push(eq(chatSessions.documentId, filters.documentId));

    const rows = await db
      .select()
      .from(chatSessions)
      .where(and(...conditions))
      .orderBy(desc(chatSessions.updatedAt));

    return rows.map((s) => ({
      id: s.id,
      title: s.title,
      documentId: s.documentId,
      workspaceId: s.workspaceId,
      workspaceFileId: s.workspaceFileId,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
    }));
  },

  async getSessionDetail(userId: string, sessionId: string): Promise<PublicChatSessionDetail> {
    const [session] = await db
      .select()
      .from(chatSessions)
      .where(and(eq(chatSessions.id, sessionId), eq(chatSessions.userId, userId), isNull(chatSessions.deletedAt)))
      .limit(1);
    if (!session) throw ApiError.notFound('Chat session not found');

    const messages = await db
      .select()
      .from(chatMessages)
      .where(eq(chatMessages.sessionId, sessionId))
      .orderBy(chatMessages.createdAt);

    return {
      id: session.id,
      title: session.title,
      documentId: session.documentId,
      workspaceId: session.workspaceId,
      workspaceFileId: session.workspaceFileId,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      messages: messages.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        senderId: m.senderId,
        createdAt: m.createdAt,
      })),
    };
  },

  async renameSession(userId: string, sessionId: string, title: string): Promise<void> {
    const [session] = await db.select().from(chatSessions).where(and(eq(chatSessions.id, sessionId), eq(chatSessions.userId, userId))).limit(1);
    if (!session) throw ApiError.notFound('Chat session not found');
    await db.update(chatSessions).set({ title }).where(eq(chatSessions.id, sessionId));
  },

  async deleteSession(userId: string, sessionId: string): Promise<void> {
    const [session] = await db.select().from(chatSessions).where(and(eq(chatSessions.id, sessionId), eq(chatSessions.userId, userId))).limit(1);
    if (!session) throw ApiError.notFound('Chat session not found');
    await db.update(chatSessions).set({ deletedAt: new Date() }).where(eq(chatSessions.id, sessionId));
  },

  async addMessage(userId: string, sessionId: string, content: string): Promise<{ userMsg: PublicChatMessage; assistantMsg: PublicChatMessage }> {
    const [session] = await db.select().from(chatSessions).where(and(eq(chatSessions.id, sessionId), eq(chatSessions.userId, userId), isNull(chatSessions.deletedAt))).limit(1);
    if (!session) throw ApiError.notFound('Chat session not found');

    const userMsg = requireRow(
      await db
        .insert(chatMessages)
        .values({ sessionId, senderId: userId, role: 'user', content })
        .returning(),
      'chat message insert',
    );
    await db.update(chatSessions).set({ updatedAt: new Date() }).where(eq(chatSessions.id, sessionId));

    // Non-streaming fallback path. The agent pipeline is used by the streaming
    // endpoint; this exists so the plain POST still returns something coherent.
    const assistantMsg = requireRow(
      await db
        .insert(chatMessages)
        .values({
          sessionId,
          senderId: null,
          role: 'assistant',
          content: `I've received your message. Use the streaming endpoint for a grounded answer.`,
        })
        .returning(),
      'assistant message insert',
    );

    return {
      userMsg: { id: userMsg.id, role: userMsg.role, content: userMsg.content, senderId: userMsg.senderId, createdAt: userMsg.createdAt },
      assistantMsg: { id: assistantMsg.id, role: assistantMsg.role, content: assistantMsg.content, senderId: assistantMsg.senderId, createdAt: assistantMsg.createdAt },
    };
  },
};
