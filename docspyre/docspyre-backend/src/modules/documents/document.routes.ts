import { Router } from 'express';
import { documentController } from './document.controller';
import { documentIdParam } from './document.validation';
import { uploadMiddleware } from './document.upload';
import { authenticate, validate } from '../../middleware';

/**
 * "My Documents" library routes. Every route requires authentication and only
 * ever operates on documents owned by the caller.
 */
const router: Router = Router();

router.use(authenticate);

router.get('/', documentController.list);
router.post('/', uploadMiddleware.array('files', 20), documentController.upload);
router.get('/trash', documentController.trash);

router.get('/:documentId/raw', validate({ params: documentIdParam }), documentController.raw);
router.post('/:documentId/restore', validate({ params: documentIdParam }), documentController.restore);
router.delete('/:documentId/permanent', validate({ params: documentIdParam }), documentController.purge);
router.delete('/:documentId', validate({ params: documentIdParam }), documentController.remove);

export { router as documentRoutes };
