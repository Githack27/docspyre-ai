import { Router } from 'express';
import { summarizerController } from './summarizer.controller';
import { authenticate } from '../../core/middleware';

const router: Router = Router();

// Publicly stream generated concept images for <img> tags
router.get('/images/:imageKey', summarizerController.serveImage);

// Authenticated agent and notes endpoints
router.post('/generate', authenticate, summarizerController.streamGenerate);
router.get('/documents/:documentId/notes', authenticate, summarizerController.listNotes);
router.get('/notes/:noteId', authenticate, summarizerController.getNote);
router.delete('/notes/:noteId', authenticate, summarizerController.deleteNote);

export { router as summarizerRoutes };
