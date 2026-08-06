import { Router } from 'express';
import { chatController } from './chat.controller';
import { createSessionSchema, addMessageSchema, listSessionsQuery, sessionIdParam } from './chat.validation';
import { authenticate, validate } from '../../middleware';
import { z } from 'zod';
import { chatDocumentController } from '../ChatDocument/chat-document.controller';

const router: Router = Router();

router.use(authenticate);

router.get('/', validate({ query: listSessionsQuery }), chatController.list);
router.post('/', validate({ body: createSessionSchema }), chatController.create);

router.get('/:sessionId', validate({ params: sessionIdParam }), chatController.get);
router.delete('/:sessionId', validate({ params: sessionIdParam }), chatController.delete);

router.patch('/:sessionId/rename', validate({ params: sessionIdParam, body: z.object({ title: z.string().trim().min(1) }) }), chatController.rename);
router.post('/:sessionId/messages', validate({ params: sessionIdParam, body: addMessageSchema }), chatController.addMessage);
router.post('/:sessionId/messages/stream', validate({ params: sessionIdParam, body: addMessageSchema }), chatDocumentController.streamMessage);

export { router as chatRoutes };
