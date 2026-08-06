import type { Request, Response } from 'express';
import { prisma } from '../../db/prisma';
import { chatService } from '../chat/chat.service';
import { cacheService } from './cache.service';
import { retrieverService } from './retriever.service';
import { generatorService } from './generator.service';
import { verifierService } from './verifier.service';
import { asyncHandler } from '../../utils/async-handler';
import { ApiError } from '../../utils/api-error';

export const chatDocumentController = {
  /**
   * SSE endpoint to stream chat responses, grounded in documents, with citations and verification.
   */
  streamMessage: asyncHandler(async (req: Request, res: Response) => {
    const { sessionId } = req.params;
    if (!sessionId) {
      throw ApiError.badRequest('Session ID is required');
    }
    const { content } = req.body;
    const userId = req.auth!.userId;

    if (!content || typeof content !== 'string') {
      throw ApiError.badRequest('Message content is required');
    }

    console.log(`[ChatDocumentController] Stream request received for sessionId=${sessionId}, query="${content.slice(0, 50)}..."`);

    // 1. Authorise user and load chat session details (enforces workspace/document access checks)
    const session = await chatService.getSessionDetail(userId, sessionId);

    // Resolve query filters based on session parameters
    const filters: { documentId?: string; workspaceId?: string } = {};
    if (session.workspaceId) {
      filters.workspaceId = session.workspaceId;
    } else if (session.documentId) {
      filters.documentId = session.documentId;
    } else if (session.workspaceFileId) {
      // Find document linked to this workspace file
      const wFile = await prisma.workspaceFile.findUnique({
        where: { id: session.workspaceFileId }
      });
      if (wFile && wFile.documentId) {
        filters.documentId = wFile.documentId;
      }
    }

    // 2. Check Semantic Cache
    const cached = await cacheService.find(content, filters);
    if (cached) {
      // Setup SSE Headers
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders();

      // Stream cached text
      const tokens = cached.answer.split(/(\s+)/);
      for (const token of tokens) {
        if (!token) continue;
        res.write(`data: ${JSON.stringify({ token })}\n\n`);
        await new Promise(resolve => setTimeout(resolve, 15));
      }

      // Stream final event with cached citations and verification status
      res.write(`data: ${JSON.stringify({
        done: true,
        citations: cached.citations,
        claimVerification: { status: 'verified', claims: [] }
      })}\n\n`);

      res.end();

      // Save user & assistant messages to the DB
      await prisma.chatMessage.create({
        data: { sessionId, senderId: userId, role: 'user', content }
      });
      await prisma.chatMessage.create({
        data: { sessionId, senderId: null, role: 'assistant', content: cached.answer }
      });
      await prisma.chatSession.update({
        where: { id: sessionId },
        data: { updatedAt: new Date() }
      });

      console.log(`[ChatDocumentController] Stream finished via cached match.`);
      return;
    }

    // 3. Retrieval
    const retrievedChunks = await retrieverService.retrieve(content, filters);

    // 4. Intent Classification
    const intent = await generatorService.classifyIntent(content);

    // 5. Generate and Stream SSE response
    const genResult = await generatorService.streamResponse(content, intent, retrievedChunks, res);

    // 6. Claim Verification (post-generation check)
    const verificationResult = await verifierService.verifyAnswer(genResult.text, genResult.citations, retrievedChunks);

    // Send final payload
    res.write(`data: ${JSON.stringify({
      done: true,
      citations: genResult.citations,
      claimVerification: verificationResult
    })}\n\n`);

    res.end();

    // 7. Save to Cache
    await cacheService.save(content, filters, genResult.text, genResult.citations);

    // 8. Save user and assistant messages to database history
    await prisma.chatMessage.create({
      data: { sessionId, senderId: userId, role: 'user', content }
    });
    await prisma.chatMessage.create({
      data: { sessionId, senderId: null, role: 'assistant', content: genResult.text }
    });
    await prisma.chatSession.update({
      where: { id: sessionId },
      data: { updatedAt: new Date() }
    });

    console.log(`[ChatDocumentController] Stream finished successfully. Verification status: ${verificationResult.status}`);
  })
};
