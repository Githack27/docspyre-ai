import { Router } from 'express';
import { chatController } from './chat.controller';
import { chatDocumentController } from '../../agents/chat-document';
import { authenticate } from '../../core/middleware';

const router: Router = Router();
router.use(authenticate);

router.get('/', chatController.list);
router.post('/', chatController.create);
router.get('/:sessionId', chatController.get);
router.patch('/:sessionId/rename', chatController.rename);
router.delete('/:sessionId', chatController.remove);
router.post('/:sessionId/messages', chatController.addMessage);
router.post('/:sessionId/messages/stream', chatDocumentController.streamMessage);
router.post('/:sessionId/continue', chatDocumentController.continueSession);

export { router as chatRoutes };
