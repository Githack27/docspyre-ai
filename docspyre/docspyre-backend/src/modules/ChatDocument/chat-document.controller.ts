import type { Request, Response } from 'express';
import { prisma } from '../../db/prisma';
import { chatService } from '../chat/chat.service';
import { cacheService } from './cache.service';
import { retrieverService } from './retriever.service';
import { generatorService } from './generator.service';
import { verifierService } from './verifier.service';
import { providerResolverService } from './provider-resolver.service';
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

    // Resolve the user's configured AI provider
    const provider = await providerResolverService.resolve(userId);

    // 1. Authorise user and load chat session details
    const session = await chatService.getSessionDetail(userId, sessionId);

    // 2. Save user message immediately so it persists regardless of pipeline outcome
    await prisma.chatMessage.create({
      data: { sessionId, senderId: userId, role: 'user', content }
    });
    await prisma.chatSession.update({
      where: { id: sessionId },
      data: { updatedAt: new Date() }
    });

    // Resolve query filters based on session parameters
    const filters: { documentId?: string; workspaceId?: string } = {};
    if (session.workspaceFileId) {
      // Specific file in a workspace — resolve its linked document
      const wFile = await prisma.workspaceFile.findUnique({
        where: { id: session.workspaceFileId }
      });
      if (wFile && wFile.documentId) {
        filters.documentId = wFile.documentId;
      } else if (session.workspaceId) {
        filters.workspaceId = session.workspaceId;
      }
    } else if (session.documentId) {
      filters.documentId = session.documentId;
    } else if (session.workspaceId) {
      filters.workspaceId = session.workspaceId;
    }

    // 3. Check Semantic Cache
    const cached = await cacheService.find(content, filters);
    if (cached) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders();

      const tokens = cached.answer.split(/(\s+)/);
      for (const token of tokens) {
        if (!token) continue;
        res.write(`data: ${JSON.stringify({ token })}\n\n`);
        await new Promise(resolve => setTimeout(resolve, 15));
      }

      res.write(`data: ${JSON.stringify({
        done: true,
        citations: cached.citations,
        claimVerification: { status: 'verified', claims: [] }
      })}\n\n`);

      res.end();

      // Save assistant response
      await prisma.chatMessage.create({
        data: { sessionId, senderId: null, role: 'assistant', content: cached.answer }
      });

      return;
    }

    // 4. Intent classification runs first so that conversational turns can skip
    // retrieval entirely.
    const intent = await generatorService.classifyIntent(content, provider);

    // 5. Retrieval. Skipped for greetings/small talk: pulling document excerpts
    // for "Hi" invites an answer that ignores what the user actually said.
    let retrievedChunks: Awaited<ReturnType<typeof retrieverService.retrieve>> = [];
    if (intent !== 'out_of_scope') {
      try {
        retrievedChunks = await retrieverService.retrieve(content, filters, 5, provider);
      } catch {
        // document_chunks table may not exist yet — proceed with empty context
      }
    }

    // 6. Recent conversation history so follow-ups like "why?" resolve correctly.
    // `session` was loaded before the current message was saved, so it holds only
    // prior turns. Trimmed to the last few to bound prompt size.
    const history = session.messages
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .slice(-6)
      .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));

    // 7. Generate and Stream SSE response
    const genResult = await generatorService.streamResponse(
      content,
      intent,
      retrievedChunks,
      res,
      provider,
      history
    );

    // 8. Claim Verification
    const verificationResult = await verifierService.verifyAnswer(genResult.text, genResult.citations, retrievedChunks, provider);

    // Send final payload
    res.write(`data: ${JSON.stringify({
      done: true,
      citations: genResult.citations,
      claimVerification: verificationResult
    })}\n\n`);

    res.end();

    // 9. Save assistant message
    await prisma.chatMessage.create({
      data: { sessionId, senderId: null, role: 'assistant', content: genResult.text }
    });

    // 10. Cache only genuine, grounded answers. Degraded output (offline mock) or
    // answers produced with no retrieved context must not be cached, otherwise a
    // transient failure gets replayed forever for the same query.
    const isCacheable = genResult.source !== 'fallback' && retrievedChunks.length > 0;
    if (isCacheable) {
      await cacheService.save(content, filters, genResult.text, genResult.citations);
    }
  })
};
