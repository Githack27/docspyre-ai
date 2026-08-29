import { relations } from 'drizzle-orm';
import { users } from './users';
import { sessions } from './sessions';
import { workspaces, workspaceMembers } from './workspaces';
import { documents, workspaceFiles, documentShares, documentChunks } from './documents';
import { auditLogs } from './audit';
import { chatSessions, chatMessages } from './chat';
import { providerConfigs } from './configuration';
import { agentRuns, documentSummaries, conversationSummaries } from './agent';
import { datasetTables, datasetQueries } from './datasets';

// ─── User Relations ───────────────────────────────────────────────────────────

export const usersRelations = relations(users, ({ many }) => ({
  sessions: many(sessions),
  memberships: many(workspaceMembers),
  ownedWorkspaces: many(workspaces),
  auditLogs: many(auditLogs),
  documents: many(documents),
  uploadedFiles: many(workspaceFiles),
  sharesSent: many(documentShares, { relationName: 'sharesSent' }),
  sharesReceived: many(documentShares, { relationName: 'sharesReceived' }),
  chatSessions: many(chatSessions),
  chatMessages: many(chatMessages),
  providerConfigs: many(providerConfigs),
  agentRuns: many(agentRuns),
}));

// ─── Session Relations ────────────────────────────────────────────────────────

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, { fields: [sessions.userId], references: [users.id] }),
}));

// ─── Workspace Relations ──────────────────────────────────────────────────────

export const workspacesRelations = relations(workspaces, ({ one, many }) => ({
  owner: one(users, { fields: [workspaces.ownerId], references: [users.id] }),
  members: many(workspaceMembers),
  files: many(workspaceFiles),
  chatSessions: many(chatSessions),
}));

export const workspaceMembersRelations = relations(workspaceMembers, ({ one }) => ({
  workspace: one(workspaces, { fields: [workspaceMembers.workspaceId], references: [workspaces.id] }),
  user: one(users, { fields: [workspaceMembers.userId], references: [users.id] }),
}));

// ─── Document Relations ───────────────────────────────────────────────────────

export const documentsRelations = relations(documents, ({ one, many }) => ({
  owner: one(users, { fields: [documents.ownerId], references: [users.id] }),
  workspaceFiles: many(workspaceFiles),
  shares: many(documentShares),
  chunks: many(documentChunks),
  chatSessions: many(chatSessions),
  summaries: many(documentSummaries),
  datasetTables: many(datasetTables),
  datasetQueries: many(datasetQueries),
  agentRuns: many(agentRuns),
}));

export const workspaceFilesRelations = relations(workspaceFiles, ({ one }) => ({
  workspace: one(workspaces, { fields: [workspaceFiles.workspaceId], references: [workspaces.id] }),
  uploadedBy: one(users, { fields: [workspaceFiles.uploadedById], references: [users.id] }),
  document: one(documents, { fields: [workspaceFiles.documentId], references: [documents.id] }),
}));

export const documentSharesRelations = relations(documentShares, ({ one }) => ({
  document: one(documents, { fields: [documentShares.documentId], references: [documents.id] }),
  sharedBy: one(users, { fields: [documentShares.sharedById], references: [users.id], relationName: 'sharesSent' }),
  sharedWith: one(users, { fields: [documentShares.sharedWithId], references: [users.id], relationName: 'sharesReceived' }),
}));

export const documentChunksRelations = relations(documentChunks, ({ one }) => ({
  document: one(documents, { fields: [documentChunks.documentId], references: [documents.id] }),
}));

// ─── Audit Relations ──────────────────────────────────────────────────────────

export const auditLogsRelations = relations(auditLogs, ({ one }) => ({
  user: one(users, { fields: [auditLogs.userId], references: [users.id] }),
}));

// ─── Chat Relations ───────────────────────────────────────────────────────────

export const chatSessionsRelations = relations(chatSessions, ({ one, many }) => ({
  user: one(users, { fields: [chatSessions.userId], references: [users.id] }),
  workspace: one(workspaces, { fields: [chatSessions.workspaceId], references: [workspaces.id] }),
  document: one(documents, { fields: [chatSessions.documentId], references: [documents.id] }),
  workspaceFile: one(workspaceFiles, { fields: [chatSessions.workspaceFileId], references: [workspaceFiles.id] }),
  messages: many(chatMessages),
  agentRuns: many(agentRuns),
  summary: one(conversationSummaries),
}));

export const chatMessagesRelations = relations(chatMessages, ({ one }) => ({
  session: one(chatSessions, { fields: [chatMessages.sessionId], references: [chatSessions.id] }),
  sender: one(users, { fields: [chatMessages.senderId], references: [users.id] }),
}));

// ─── Configuration Relations ──────────────────────────────────────────────────

export const providerConfigsRelations = relations(providerConfigs, ({ one }) => ({
  user: one(users, { fields: [providerConfigs.userId], references: [users.id] }),
}));

// ─── Agent Relations ──────────────────────────────────────────────────────────

export const agentRunsRelations = relations(agentRuns, ({ one }) => ({
  session: one(chatSessions, { fields: [agentRuns.sessionId], references: [chatSessions.id] }),
  user: one(users, { fields: [agentRuns.userId], references: [users.id] }),
  message: one(chatMessages, { fields: [agentRuns.messageId], references: [chatMessages.id] }),
  document: one(documents, { fields: [agentRuns.documentId], references: [documents.id] }),
  workspace: one(workspaces, { fields: [agentRuns.workspaceId], references: [workspaces.id] }),
}));

export const documentSummariesRelations = relations(documentSummaries, ({ one }) => ({
  document: one(documents, { fields: [documentSummaries.documentId], references: [documents.id] }),
}));

export const conversationSummariesRelations = relations(conversationSummaries, ({ one }) => ({
  session: one(chatSessions, {
    fields: [conversationSummaries.sessionId],
    references: [chatSessions.id],
  }),
  throughMessage: one(chatMessages, {
    fields: [conversationSummaries.throughMessageId],
    references: [chatMessages.id],
  }),
}));

// ─── Dataset Relations ────────────────────────────────────────────────────────

export const datasetTablesRelations = relations(datasetTables, ({ one }) => ({
  document: one(documents, { fields: [datasetTables.documentId], references: [documents.id] }),
}));

export const datasetQueriesRelations = relations(datasetQueries, ({ one }) => ({
  document: one(documents, { fields: [datasetQueries.documentId], references: [documents.id] }),
}));
