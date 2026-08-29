import { Router } from 'express';
import { workspaceController } from './workspace.controller';
import { createWorkspaceSchema, addFileSchema, workspaceIdParam, attachDocumentSchema, fileParam } from './workspace.validation';
import { uploadMiddleware } from '../documents/document.upload';
import { authenticate, validate, requireWorkspaceRole } from '../../core/middleware';

const router: Router = Router();
router.use(authenticate);

router.get('/', workspaceController.list);
router.post('/', validate({ body: createWorkspaceSchema }), workspaceController.create);

router.get('/:workspaceId', validate({ params: workspaceIdParam }), requireWorkspaceRole('VIEWER'), workspaceController.get);
router.get('/:workspaceId/files', validate({ params: workspaceIdParam }), requireWorkspaceRole('VIEWER'), workspaceController.listFiles);
router.post('/:workspaceId/files', validate({ params: workspaceIdParam, body: addFileSchema }), requireWorkspaceRole('MEMBER'), workspaceController.addFile);
router.post('/:workspaceId/files/upload', validate({ params: workspaceIdParam }), requireWorkspaceRole('MEMBER'), uploadMiddleware.array('files', 20), workspaceController.uploadFiles);
router.post('/:workspaceId/files/attach', validate({ params: workspaceIdParam, body: attachDocumentSchema }), requireWorkspaceRole('MEMBER'), workspaceController.attachDocument);
router.delete('/:workspaceId/files/:fileId', validate({ params: fileParam }), requireWorkspaceRole('MEMBER'), workspaceController.deleteFile);

export { router as workspaceRoutes };
