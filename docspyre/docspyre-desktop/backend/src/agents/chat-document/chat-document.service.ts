import { db, eq, documents, chatMessages, chatSessions, conversationSummaries, workspaceFiles } from '@docspyre/database';
import { env } from '../../core/config';
import { logger } from '../../core/utils/logger';
import { ApiError } from '../../core/utils/api-error';
import { chatService } from '../../modules/chat/chat.service';
import { providerResolverService, type ResolvedProvider } from './llm/provider-resolver.service';
import { describeModel } from './llm/model.factory';
import { datasetService } from './data/dataset.service';
import { conversationSummaryService } from './memory/conversation-summary.service';
import { createToolContext, createAgentTools } from './agent/tools';
import { buildAgentGraph } from './agent/graph';
import type { AgentRuntime, AgentStreamEvent } from './agent/runtime';
import type { AnswerSource, Citation, ClaimVerification } from './agent/state';
import { agentRunRepository, type AgentRunScope } from './persistence/agent-run.repository';

export const CONTEXT_USAGE_LIMIT_TOKENS = 2_000_000;

export interface TurnResult {
  answer: string;
  route: string;
  citations: Citation[];
  verification: ClaimVerification | null;
  sql: string | null;
  servedFromCache: boolean;
  totalTokens: number;
  newTitle: string | null;
  sessionTitle?: string | null;
}

interface ScopeResolution extends AgentRunScope {
  documentName: string | null;
  storageKey: string | null;
}

/** Maps a chat session onto the documents the agent may read this turn. */
const resolveScope = async (session: {
  documentId: string | null;
  workspaceId: string | null;
  workspaceFileId: string | null;
}): Promise<ScopeResolution> => {
  let documentId = session.documentId;
  let workspaceId = session.workspaceId;

  // A workspace file points at a document; prefer that narrower scope.
  if (session.workspaceFileId) {
    const [file] = await db
      .select({ documentId: workspaceFiles.documentId })
      .from(workspaceFiles)
      .where(eq(workspaceFiles.id, session.workspaceFileId))
      .limit(1);

    if (file?.documentId) {
      documentId = file.documentId;
      workspaceId = null;
    }
  }

  // Document scope is more specific than workspace scope.
  if (documentId) workspaceId = null;

  if (!documentId) {
    return { documentId: null, workspaceId, documentName: null, storageKey: null };
  }

  const [document] = await db
    .select({ name: documents.name, storageKey: documents.storageKey })
    .from(documents)
    .where(eq(documents.id, documentId))
    .limit(1);

  return {
    documentId,
    workspaceId,
    documentName: document?.name ?? null,
    storageKey: document?.storageKey ?? null,
  };
};

/** Replays a cached answer as a token stream so the UI behaves identically. */
const replay = async (
  answer: string,
  emit: (event: AgentStreamEvent) => void,
): Promise<void> => {
  const tokens = answer.split(/(\s+)/);

  for (const token of tokens) {
    if (!token) continue;
    emit({ type: 'token', token });
    await new Promise((resolve) => setTimeout(resolve, 8));
  }
};

export const chatDocumentService = {
  /**
   * Runs one chat turn: enforce 2M context limit, authorise, persist the question,
   * answer it (from cache or by running the agent graph with web-search fallback),
   * track token usage, auto-generate title if needed, and compact history.
   */
  async runTurn(input: {
    userId: string;
    sessionId: string;
    content: string;
    emit: (event: AgentStreamEvent) => void;
  }): Promise<TurnResult> {
    const startedAt = Date.now();

    // Authorises the caller against the session and gives us prior messages & token count.
    const session = await chatService.getSessionDetail(input.userId, input.sessionId);

    // ── Context Usage Restriction (2M Tokens Cap) ───────────────────────────
    const currentTokens = session.totalTokens || 0;
    if (currentTokens >= CONTEXT_USAGE_LIMIT_TOKENS) {
      throw ApiError.badRequest(
        'Context usage limit of 2,000,000 tokens has been reached for this chat session. A new session must be started.',
      );
    }

    const provider: ResolvedProvider | null = await providerResolverService.resolve(
      input.userId,
      session.workspaceId,
    );
    const scope = await resolveScope(session);

    // Persist the question first so it survives any downstream failure.
    const [userMessage] = await db
      .insert(chatMessages)
      .values({
        sessionId: input.sessionId,
        senderId: input.userId,
        role: 'user',
        content: input.content,
      })
      .returning({ id: chatMessages.id });

    await db
      .update(chatSessions)
      .set({ updatedAt: new Date() })
      .where(eq(chatSessions.id, input.sessionId));

    const runScope: AgentRunScope = {
      documentId: scope.documentId,
      workspaceId: scope.workspaceId,
    };
    const queryHash = agentRunRepository.hashQuery(input.content, runScope);

    // ── Cache path ──────────────────────────────────────────────────────────
    if (env.AGENT_CACHE_ENABLED) {
      const cached = await agentRunRepository.findCached(queryHash, runScope);

      if (cached) {
        await replay(cached.answer, input.emit);

        const messageId = await this.persistAnswer(input.sessionId, cached.answer);

        const cachedTokens = Math.ceil((input.content.length + cached.answer.length) / 4);
        const newTotalTokens = currentTokens + cachedTokens;

        await db
          .update(chatSessions)
          .set({ totalTokens: newTotalTokens, updatedAt: new Date() })
          .where(eq(chatSessions.id, input.sessionId));

        const runId = await agentRunRepository.record({
          sessionId: input.sessionId,
          userId: input.userId,
          scope: runScope,
          queryHash,
          query: input.content,
          route: 'document_qa',
          answer: cached.answer,
          citations: cached.citations,
          toolCalls: [],
          verification: cached.verification,
          retrievedChunkIds: [],
          sql: cached.sql,
          sqlRowCount: null,
          provider: provider?.providerId ?? null,
          model: provider ? describeModel(provider) : null,
          promptTokens: null,
          completionTokens: null,
          latencyMs: Date.now() - startedAt,
          status: 'SUCCESS',
          error: null,
          servedFromCache: true,
          answerSource: 'model',
        });

        if (runId && messageId) await agentRunRepository.linkMessage(runId, messageId);

        return {
          answer: cached.answer,
          route: 'cache',
          citations: cached.citations,
          verification: cached.verification,
          sql: cached.sql,
          servedFromCache: true,
          totalTokens: newTotalTokens,
          newTitle: null,
        };
      }
    }

    // ── Agent path ──────────────────────────────────────────────────────────
    const [datasetSchemas, datasetSources, conversation] = await Promise.all([
      scope.documentId ? datasetService.getSchemas(scope.documentId) : Promise.resolve([]),
      scope.documentId && scope.storageKey
        ? datasetService.getSources(scope.documentId, scope.storageKey)
        : Promise.resolve([]),
      conversationSummaryService.getContext(input.sessionId, userMessage?.id),
    ]);

    const ctx = createToolContext({
      userId: input.userId,
      sessionId: input.sessionId,
      provider,
      documentId: scope.documentId,
      workspaceId: scope.workspaceId,
      documentName: scope.documentName,
      storageKey: scope.storageKey,
      previousSessionId: session.previousSessionId,
      datasetSchemas,
      datasetSources,
    });

    const runtime: AgentRuntime = {
      ctx,
      tools: createAgentTools(ctx),
      provider,
      conversation,
      emit: input.emit,
    };

    let answer = '';
    let route = 'document_qa';
    let citations: Citation[] = [];
    let verification: ClaimVerification | null = null;
    let status: 'SUCCESS' | 'PARTIAL' | 'FAILED' = 'SUCCESS';
    let error: string | null = null;
    let answerSource: AnswerSource = 'model';
    let promptTokens: number | null = null;
    let completionTokens: number | null = null;

    try {
      const graph = buildAgentGraph(runtime);
      const final = await graph.invoke({ question: input.content });

      answer = final.answer ?? '';
      route = final.route ?? 'document_qa';
      citations = final.citations ?? [];
      verification = final.verification ?? null;
      answerSource = final.answerSource ?? 'model';
      promptTokens = final.usage?.promptTokens ?? null;
      completionTokens = final.usage?.completionTokens ?? null;
      error = final.error ?? null;

      if (!answer.trim()) {
        status = 'FAILED';
        error = error ?? 'The agent produced no answer.';
      } else if (answerSource === 'degraded') {
        status = 'PARTIAL';
      }
    } catch (graphError) {
      status = 'FAILED';
      error = graphError instanceof Error ? graphError.message : String(graphError);
      logger.error('Agent graph failed', { sessionId: input.sessionId, error });

      if (!answer.trim()) {
        answer =
          'Something went wrong while working through that. Please try again, and rephrase it if the problem repeats.';
        input.emit({ type: 'token', token: answer });
      }
    }

    const messageId = await this.persistAnswer(input.sessionId, answer);

    // ── Session Title Auto-Generation ───────────────────────────────────────
    let newTitle: string | null = null;
    const isGenericTitle =
      !session.title ||
      session.title.startsWith('Chat on ') ||
      session.title === 'New Chat Session' ||
      session.title === 'Untitled' ||
      session.title === 'Document Discussion' ||
      session.title.startsWith('Discussion on ');

    // Auto-generate if title is still generic/default
    if (isGenericTitle) {
      try {
        const firstUserMsg =
          session.messages.find((m) => m.role === 'user')?.content || input.content;

        newTitle = await conversationSummaryService.autoGenerateTitle(
          firstUserMsg,
          answer,
          scope.documentName,
          provider,
        );
      } catch (titleErr) {
        logger.debug('Session title auto-generation failed', { error: titleErr });
      }
    }

    const sessionTitle = newTitle || (!isGenericTitle ? session.title : null);

    // ── Token Usage & Context Tracking Update ───────────────────────────────
    const turnTokens =
      (promptTokens || 0) + (completionTokens || 0) ||
      Math.ceil((input.content.length + answer.length) / 4);
    const newTotalTokens = currentTokens + turnTokens;

    await db
      .update(chatSessions)
      .set({
        totalTokens: newTotalTokens,
        ...(newTitle ? { title: newTitle } : {}),
        updatedAt: new Date(),
      })
      .where(eq(chatSessions.id, input.sessionId));

    const runId = await agentRunRepository.record({
      sessionId: input.sessionId,
      userId: input.userId,
      scope: runScope,
      queryHash,
      query: input.content,
      route: route as never,
      answer,
      citations,
      toolCalls: ctx.toolCalls,
      verification,
      retrievedChunkIds: ctx.artifacts.chunks.map((chunk) => chunk.chunk_id),
      sql: ctx.artifacts.sql,
      sqlRowCount: ctx.artifacts.sqlRowCount,
      provider: provider?.providerId ?? null,
      model: provider ? describeModel(provider) : null,
      promptTokens,
      completionTokens,
      latencyMs: Date.now() - startedAt,
      status,
      error,
      servedFromCache: false,
      answerSource,
    });

    if (runId && messageId) await agentRunRepository.linkMessage(runId, messageId);

    // Compact history in the background
    void conversationSummaryService.maybeCompact(input.sessionId, provider);

    return {
      answer,
      route,
      citations,
      verification,
      sql: ctx.artifacts.sql,
      servedFromCache: false,
      totalTokens: newTotalTokens,
      newTitle,
      sessionTitle,
    };
  },

  /**
   * Chains into a new chat session when the context limit is reached (or on user request).
   * Summarizes the entire prior session as a comprehensive prose paragraph,
   * creates a new session wired to the same document/workspace, sets previousSessionId,
   * and seeds initialSummary so the new chat has immediate context.
   */
  async continueSession(
    userId: string,
    sessionId: string,
  ): Promise<{
    session: {
      id: string;
      title: string;
      documentId: string | null;
      workspaceId: string | null;
      workspaceFileId: string | null;
      previousSessionId: string | null;
      initialSummary: string | null;
      totalTokens: number;
      createdAt: Date;
      updatedAt: Date;
    };
  }> {
    const oldSession = await chatService.getSessionDetail(userId, sessionId);
    const provider = await providerResolverService.resolve(userId, oldSession.workspaceId);
    const scope = await resolveScope(oldSession);

    // 1. Synthesize full conversation summary prose paragraph
    const proseSummary = await conversationSummaryService.generateFullSessionSummary(
      sessionId,
      provider,
      scope.documentName,
    );

    // 2. Derive new title
    const baseTitle = oldSession.title.replace(/^Part \d+:\s*/, '');
    const newTitle = `Part 2: ${baseTitle}`;

    // 3. Create chained session with reset token count
    const [newSession] = await db
      .insert(chatSessions)
      .values({
        title: newTitle,
        userId,
        documentId: oldSession.documentId,
        workspaceId: oldSession.workspaceId,
        workspaceFileId: oldSession.workspaceFileId,
        previousSessionId: oldSession.id,
        initialSummary: proseSummary,
        totalTokens: 0,
      })
      .returning();

    if (!newSession) {
      throw ApiError.internal('Failed to create chained session');
    }

    // 4. Pre-seed conversation_summaries with the prose summary
    try {
      await db.insert(conversationSummaries).values({
        sessionId: newSession.id,
        summary: proseSummary,
        messageCount: 0,
        tokenCount: Math.ceil(proseSummary.length / 4),
        model: provider ? describeModel(provider) : 'summary-v1',
      });
    } catch {
      // Non-fatal
    }

    return {
      session: {
        id: newSession.id,
        title: newSession.title,
        documentId: newSession.documentId,
        workspaceId: newSession.workspaceId,
        workspaceFileId: newSession.workspaceFileId,
        previousSessionId: newSession.previousSessionId,
        initialSummary: newSession.initialSummary,
        totalTokens: newSession.totalTokens,
        createdAt: newSession.createdAt,
        updatedAt: newSession.updatedAt,
      },
    };
  },

  /** Writes the assistant turn and bumps session activity. */
  async persistAnswer(sessionId: string, answer: string): Promise<string | null> {
    if (!answer.trim()) return null;

    try {
      const [message] = await db
        .insert(chatMessages)
        .values({ sessionId, senderId: null, role: 'assistant', content: answer })
        .returning({ id: chatMessages.id });

      await db
        .update(chatSessions)
        .set({ updatedAt: new Date() })
        .where(eq(chatSessions.id, sessionId));

      return message?.id ?? null;
    } catch (error) {
      logger.error('Failed to persist assistant message', {
        sessionId,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  },
};
