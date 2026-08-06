import { prisma } from '../../db/prisma';
import { ApiError } from '../../utils/api-error';
import type { CreateSessionInput, AddMessageInput } from './chat.validation';
import type { PublicChatMessage, PublicChatSession, PublicChatSessionDetail } from './chat.types';

const toSession = (s: any): PublicChatSession => ({
  id: s.id,
  title: s.title,
  userId: s.userId,
  workspaceId: s.workspaceId,
  documentId: s.documentId,
  workspaceFileId: s.workspaceFileId,
  createdAt: s.createdAt,
  updatedAt: s.updatedAt,
});

const toMessage = (m: any): PublicChatMessage => ({
  id: m.id,
  sessionId: m.sessionId,
  senderId: m.senderId,
  role: m.role as 'user' | 'assistant' | 'system',
  content: m.content,
  createdAt: m.createdAt,
});

const generateSimulatedResponse = (docName: string, query: string): string => {
  const q = query.toLowerCase();
  if (q.includes('summary') || q.includes('summarize') || q.includes('overview')) {
    return `Here is a summary of the document **"${docName}"**:\n\n1. **Core Content**: The file contains structural documentation, metadata schemas, and configuration standards.\n2. **Key Metrics**: Data analysis confirms all parameters reside within acceptable thresholds.\n3. **Next Steps**: Recommended actions include reviewing validation results and aligning components with specifications.\n\nWhat other details about **"${docName}"** can I fetch for you?`;
  }
  if (q.includes('hello') || q.includes('hi') || q.includes('hey')) {
    return `Hello! I have analyzed the document **"${docName}"** and loaded its context. Ask me any questions, and I'll help you extract the relevant insights!`;
  }
  if (q.includes('author') || q.includes('who wrote')) {
    return `The creator details are not explicitly highlighted in the document text, but the system logs indicate it was uploaded as part of your workspace repository.`;
  }
  return `Analyzing **"${docName}"** for your query: *"Ref: ${query}"*\n\nBased on the document context:\n- The document outlines standard operating procedures matching these terms.\n- Ensure integrations are secure and adhere to the project's styling and schema conventions.\n- There are no warning flags related to your search parameter inside the document body.\n\nLet me know if you need clarification on specific sections!`;
};

export const chatService = {
  /** Creates a chat session for a document (private or workspace). */
  async createSession(userId: string, input: CreateSessionInput): Promise<PublicChatSession> {
    // If a workspace is specified, verify membership
    if (input.workspaceId) {
      const membership = await prisma.workspaceMember.findFirst({
        where: { workspaceId: input.workspaceId, userId },
      });
      if (!membership) throw ApiError.forbidden('You are not a member of this project');
    } else if (input.documentId) {
      // If private chat, verify the document is NOT linked to any project
      const linked = await prisma.workspaceFile.findFirst({
        where: { documentId: input.documentId, deletedAt: null },
      });
      if (linked) {
        throw ApiError.badRequest('This document is linked to a project. Private chats are disabled.');
      }
    }

    const session = await prisma.chatSession.create({
      data: {
        title: input.title,
        userId,
        workspaceId: input.workspaceId ?? null,
        documentId: input.documentId ?? null,
        workspaceFileId: input.workspaceFileId ?? null,
      },
    });

    return toSession(session);
  },

  /** Lists chat sessions. Enforces membership for workspace chats, owner-only for private chats. */
  async listSessions(
    userId: string,
    filters: { documentId?: string; workspaceId?: string }
  ): Promise<PublicChatSession[]> {
    const whereClause: any = { deletedAt: null };

    if (filters.workspaceId) {
      // Verify workspace membership
      const membership = await prisma.workspaceMember.findFirst({
        where: { workspaceId: filters.workspaceId, userId },
      });
      if (!membership) throw ApiError.forbidden('You are not a member of this project');
      whereClause.workspaceId = filters.workspaceId;
    } else if (filters.documentId) {
      // Check if document is linked to any project
      const linked = await prisma.workspaceFile.findFirst({
        where: { documentId: filters.documentId, deletedAt: null },
      });
      if (linked) {
        return [];
      }
      whereClause.documentId = filters.documentId;
      whereClause.userId = userId;
      whereClause.workspaceId = null;
    } else {
      // Return all private chats for this user, excluding those linked to projects
      whereClause.userId = userId;
      whereClause.workspaceId = null;
      whereClause.document = {
        workspaceFiles: {
          none: {
            deletedAt: null
          }
        }
      };
    }

    const sessions = await prisma.chatSession.findMany({
      where: whereClause,
      orderBy: { updatedAt: 'desc' },
    });

    return sessions.map(toSession);
  },

  /** Gets chat session details with message history. */
  async getSessionDetail(userId: string, sessionId: string): Promise<PublicChatSessionDetail> {
    const session = await prisma.chatSession.findUnique({
      where: { id: sessionId },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!session || session.deletedAt) {
      throw ApiError.notFound('Chat session not found');
    }

    // Verify access
    if (session.workspaceId) {
      const membership = await prisma.workspaceMember.findFirst({
        where: { workspaceId: session.workspaceId, userId },
      });
      if (!membership) throw ApiError.forbidden('You do not have access to this project chat');
    } else {
      if (session.userId !== userId) {
        throw ApiError.forbidden('You do not have access to this private chat');
      }
      if (session.documentId) {
        const linked = await prisma.workspaceFile.findFirst({
          where: { documentId: session.documentId, deletedAt: null },
        });
        if (linked) {
          throw ApiError.forbidden('This document has been linked to a project. Private chats are disabled.');
        }
      }
    }

    return {
      ...toSession(session),
      messages: session.messages.map(toMessage),
    };
  },

  /** Renames a chat session. */
  async renameSession(userId: string, sessionId: string, title: string): Promise<PublicChatSession> {
    const session = await prisma.chatSession.findUnique({
      where: { id: sessionId },
    });

    if (!session || session.deletedAt) {
      throw ApiError.notFound('Chat session not found');
    }

    // Enforce owner-only or workspace member/owner update
    if (session.workspaceId) {
      const membership = await prisma.workspaceMember.findFirst({
        where: { workspaceId: session.workspaceId, userId },
      });
      if (!membership) throw ApiError.forbidden('You do not have permission to rename this chat');
    } else {
      if (session.userId !== userId) {
        throw ApiError.forbidden('You cannot rename someone else\'s private chat');
      }
    }

    const updated = await prisma.chatSession.update({
      where: { id: sessionId },
      data: { title },
    });

    return toSession(updated);
  },

  /** Soft-deletes a chat session. */
  async deleteSession(userId: string, sessionId: string): Promise<void> {
    const session = await prisma.chatSession.findUnique({
      where: { id: sessionId },
    });

    if (!session || session.deletedAt) {
      throw ApiError.notFound('Chat session not found');
    }

    if (session.workspaceId) {
      const membership = await prisma.workspaceMember.findFirst({
        where: { workspaceId: session.workspaceId, userId },
      });
      if (!membership) throw ApiError.forbidden('You do not have permission to delete this chat');
    } else {
      if (session.userId !== userId) {
        throw ApiError.forbidden('You cannot delete someone else\'s private chat');
      }
    }

    await prisma.chatSession.update({
      where: { id: sessionId },
      data: { deletedAt: new Date() },
    });
  },

  /** Adds a message and triggers simulated AI response. */
  async addMessage(userId: string, sessionId: string, input: AddMessageInput): Promise<PublicChatMessage> {
    const session = await prisma.chatSession.findUnique({
      where: { id: sessionId },
    });

    if (!session || session.deletedAt) {
      throw ApiError.notFound('Chat session not found');
    }

    // Verify access
    if (session.workspaceId) {
      const membership = await prisma.workspaceMember.findFirst({
        where: { workspaceId: session.workspaceId, userId },
      });
      if (!membership) throw ApiError.forbidden('You do not have access to this chat session');
    } else {
      if (session.userId !== userId) {
        throw ApiError.forbidden('You do not have access to this private chat session');
      }
    }

    // Resolve document name for context
    let docName = 'Selected Document';
    if (session.documentId) {
      const doc = await prisma.document.findUnique({ where: { id: session.documentId } });
      if (doc) docName = doc.name;
    } else if (session.workspaceFileId) {
      const file = await prisma.workspaceFile.findUnique({ where: { id: session.workspaceFileId } });
      if (file) docName = file.name;
    }

    // 1. Save user message
    const userMsg = await prisma.chatMessage.create({
      data: {
        sessionId,
        senderId: userId,
        role: 'user',
        content: input.content,
      },
    });

    // 2. Generate simulated AI response
    const aiContent = generateSimulatedResponse(docName, input.content);

    // 3. Save assistant message
    await prisma.chatMessage.create({
      data: {
        sessionId,
        senderId: null,
        role: 'assistant',
        content: aiContent,
      },
    });

    // 4. Update session timestamp
    await prisma.chatSession.update({
      where: { id: sessionId },
      data: { updatedAt: new Date() },
    });

    return toMessage(userMsg);
  },
};
