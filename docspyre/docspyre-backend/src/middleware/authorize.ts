import type { NextFunction, Request, Response } from 'express';
import { WorkspaceRole } from '@docspyre/database';
import { prisma } from '../db/prisma';
import { ApiError } from '../utils/api-error';
import { asyncHandler } from '../utils/async-handler';

// Higher number => more privilege. Lets us express "ADMIN or above" cleanly.
const ROLE_RANK: Record<WorkspaceRole, number> = {
  [WorkspaceRole.VIEWER]: 0,
  [WorkspaceRole.MEMBER]: 1,
  [WorkspaceRole.ADMIN]: 2,
  [WorkspaceRole.OWNER]: 3,
};

/**
 * Reusable RBAC guard. Must run after `authenticate`. Reads `:workspaceId`
 * from the route and ensures the caller holds at least the required role.
 * This is the extension point for all future workspace-scoped resources.
 */
export const requireWorkspaceRole = (minimumRole: WorkspaceRole) =>
  asyncHandler(async (req: Request, _res: Response, next: NextFunction) => {
    if (!req.auth) throw ApiError.unauthorized();

    const workspaceId = req.params.workspaceId;
    if (!workspaceId) throw ApiError.badRequest('workspaceId is required');

    const membership = await prisma.workspaceMember.findUnique({
      where: {
        workspaceId_userId: { workspaceId, userId: req.auth.userId },
      },
    });

    if (!membership || ROLE_RANK[membership.role] < ROLE_RANK[minimumRole]) {
      throw ApiError.forbidden('Insufficient workspace permissions');
    }

    next();
  });
