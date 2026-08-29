import { Router } from 'express';
import { documentController } from './document.controller';
import { documentIdParam } from './document.validation';
import { uploadMiddleware } from './document.upload';
import { authenticate, validate } from '../../core/middleware';

const router: Router = Router();
router.use(authenticate);

router.get('/', documentController.list);
router.post('/', uploadMiddleware.array('files', 20), documentController.upload);
router.get('/trash', documentController.trash);
router.get('/:documentId/raw', validate({ params: documentIdParam }), documentController.raw);
router.post('/:documentId/restore', validate({ params: documentIdParam }), documentController.restore);
router.delete('/:documentId/permanent', validate({ params: documentIdParam }), documentController.purge);
router.delete('/:documentId', validate({ params: documentIdParam }), documentController.remove);
router.post('/:documentId/reingest', validate({ params: documentIdParam }), documentController.reingest);

export { router as documentRoutes };
