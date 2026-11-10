import type { NextFunction, Request, Response } from 'express';
import { db, eq, and, workspaceMembers } from '@docspyre/database';
import { ApiError } from '../utils/api-error';
import { asyncHandler } from '../utils/async-handler';

type WorkspaceRole = 'OWNER' | 'ADMIN' | 'MEMBER' | 'VIEWER';

const ROLE_RANK: Record<WorkspaceRole, number> = {
  VIEWER: 0,
  MEMBER: 1,
  ADMIN: 2,
  OWNER: 3,
};

export const requireWorkspaceRole = (minimumRole: WorkspaceRole) =>
  asyncHandler(async (req: Request, _res: Response, next: NextFunction) => {
    if (!req.auth) throw ApiError.unauthorized();

    const workspaceId = req.params.workspaceId ?? req.params.id;
    if (!workspaceId) throw ApiError.badRequest('workspaceId is required');

    const [membership] = await db
      .select()
      .from(workspaceMembers)
      .where(
        and(
          eq(workspaceMembers.workspaceId, workspaceId),
          eq(workspaceMembers.userId, req.auth.userId),
        ),
      )
      .limit(1);

    if (!membership || ROLE_RANK[membership.role] < ROLE_RANK[minimumRole]) {
      throw ApiError.forbidden('Insufficient workspace permissions');
    }

    next();
  });
