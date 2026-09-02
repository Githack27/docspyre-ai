import type { Request, Response } from 'express';
import { asyncHandler } from '../../core/utils/async-handler';
import { ApiError } from '../../core/utils/api-error';
import { logger } from '../../core/utils/logger';
import { chatDocumentService } from './chat-document.service';
import type { AgentStreamEvent } from './agent/runtime';

/** Serialises one SSE frame. */
const frame = (payload: unknown): string => `data: ${JSON.stringify(payload)}\n\n`;

/**
 * Translates agent events into SSE frames.
 */
const toFrame = (event: AgentStreamEvent): string | null => {
  switch (event.type) {
    case 'token':
      return frame({ token: event.token });
    case 'route':
      return frame({ route: event.route });
    case 'tool':
      return frame({ tool: { name: event.tool, summary: event.summary } });
    case 'sql':
      return frame({ sql: event.sql, attempt: event.attempt });
    case 'notice':
      return frame({ notice: event.message });
    default:
      return null;
  }
};

export const chatDocumentController = {
  /**
   * Streams an agent turn over Server-Sent Events.
   */
  streamMessage: asyncHandler(async (req: Request, res: Response) => {
    const { sessionId } = req.params;
    if (!sessionId) throw ApiError.badRequest('Session ID is required');

    const content = typeof req.body?.content === 'string' ? req.body.content.trim() : '';
    if (!content) throw ApiError.badRequest('Message content is required');

    const userId = req.auth!.userId;

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    let clientGone = false;
    req.on('close', () => {
      clientGone = true;
    });

    const emit = (event: AgentStreamEvent): void => {
      if (clientGone || res.writableEnded) return;
      const payload = toFrame(event);
      if (payload) res.write(payload);
    };

    try {
      const result = await chatDocumentService.runTurn({
        userId,
        sessionId,
        content,
        emit,
      });

      if (!clientGone && !res.writableEnded) {
        res.write(
          frame({
            done: true,
            citations: result.citations,
            claimVerification: result.verification ?? { status: 'skipped', claims: [] },
            route: result.route,
            sql: result.sql,
            servedFromCache: result.servedFromCache,
            totalTokens: result.totalTokens,
            newTitle: result.newTitle,
          }),
        );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error('Chat stream failed', { sessionId, error: message });

      if (!clientGone && !res.writableEnded) {
        res.write(
          frame({
            done: true,
            error: error instanceof ApiError ? message : 'The request could not be completed.',
            isLimitReached: message.includes('2,000,000') || message.includes('Context usage limit'),
            citations: [],
            claimVerification: { status: 'unverified', claims: [] },
          }),
        );
      }
    } finally {
      if (!res.writableEnded) res.end();
    }
  }),

  /**
   * Continues an existing chat session into a new chained session, summarizing
   * the full conversation and resetting the 2M token limit.
   */
  continueSession: asyncHandler(async (req: Request, res: Response) => {
    const { sessionId } = req.params;
    if (!sessionId) throw ApiError.badRequest('Session ID is required');

    const userId = req.auth!.userId;
    const result = await chatDocumentService.continueSession(userId, sessionId);

    res.status(201).json(result);
  }),
};
