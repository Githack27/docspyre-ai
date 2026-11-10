import { Router } from 'express';
import { shareController } from './share.controller';
import { shareDocumentSchema, revokeShareParam, documentParam } from './share.validation';
import { authenticate, validate } from '../../core/middleware';

const router: Router = Router();
router.use(authenticate);

router.post('/', validate({ body: shareDocumentSchema }), shareController.share);
router.get('/with-me', shareController.withMe);
router.get('/by-me', shareController.byMe);
router.get('/document/:documentId', validate({ params: documentParam }), shareController.recipients);
router.delete('/:documentId/:userId', validate({ params: revokeShareParam }), shareController.revoke);

export { router as shareRoutes };
