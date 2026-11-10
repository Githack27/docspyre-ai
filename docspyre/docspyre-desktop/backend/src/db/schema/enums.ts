import { pgEnum } from 'drizzle-orm/pg-core';

export const userStatusEnum = pgEnum('UserStatus', [
  'PENDING',
  'ACTIVE',
  'SUSPENDED',
  'DEACTIVATED',
]);

export const workspaceRoleEnum = pgEnum('WorkspaceRole', [
  'OWNER',
  'ADMIN',
  'MEMBER',
  'VIEWER',
]);

export const auditActionEnum = pgEnum('AuditAction', [
  'USER_REGISTERED',
  'USER_LOGIN',
  'USER_LOGIN_FAILED',
  'USER_LOGOUT',
  'PASSWORD_CHANGED',
  'SESSION_REVOKED',
]);

export const documentKindEnum = pgEnum('DocumentKind', [
  'IMAGE',
  'VIDEO',
  'AUDIO',
  'PDF',
  'DOCUMENT',
  'OTHER',
]);

export const sharePermissionEnum = pgEnum('SharePermission', [
  'VIEW',
  'DOWNLOAD',
]);
