import { Router } from 'express';
import { WorkspaceRole } from '@docspyre/database';
import { workspaceController } from './workspace.controller';
import {
  addFileSchema,
  attachDocumentSchema,
  createWorkspaceSchema,
  fileParam,
  workspaceIdParam,
} from './workspace.validation';
import { authenticate, requireWorkspaceRole, validate } from '../../middleware';
import { uploadMiddleware } from '../documents/document.upload';

/**
 * Workspace (project) routes. Every route requires authentication; routes that
 * target a specific workspace additionally enforce membership/role.
 */
const router: Router = Router();

router.use(authenticate);

router.get('/', workspaceController.list);
router.post('/', validate({ body: createWorkspaceSchema }), workspaceController.create);

router.get(
  '/:workspaceId',
  validate({ params: workspaceIdParam }),
  requireWorkspaceRole(WorkspaceRole.VIEWER),
  workspaceController.get,
);

router.get(
  '/:workspaceId/files',
  validate({ params: workspaceIdParam }),
  requireWorkspaceRole(WorkspaceRole.VIEWER),
  workspaceController.listFiles,
);

router.post(
  '/:workspaceId/files',
  validate({ params: workspaceIdParam, body: addFileSchema }),
  requireWorkspaceRole(WorkspaceRole.MEMBER),
  workspaceController.addFile,
);

router.post(
  '/:workspaceId/files/upload',
  validate({ params: workspaceIdParam }),
  requireWorkspaceRole(WorkspaceRole.MEMBER),
  uploadMiddleware.array('files', 20),
  workspaceController.uploadFiles,
);

router.post(
  '/:workspaceId/files/attach',
  validate({ params: workspaceIdParam, body: attachDocumentSchema }),
  requireWorkspaceRole(WorkspaceRole.MEMBER),
  workspaceController.attachDocument,
);

router.delete(
  '/:workspaceId/files/:fileId',
  validate({ params: fileParam }),
  requireWorkspaceRole(WorkspaceRole.MEMBER),
  workspaceController.deleteFile,
);

export { router as workspaceRoutes };
