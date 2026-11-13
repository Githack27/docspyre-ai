import { Router } from 'express';
import { authRoutes } from '../modules/auth/index.js';
import { workspaceRoutes } from '../modules/workspaces/index.js';
import { userRoutes } from '../modules/users/index.js';
import { documentRoutes } from '../modules/documents/index.js';
import { chatRoutes } from '../modules/chat/index.js';
import { configurationRoutes } from '../modules/configuration/index.js';
import { summarizerRoutes } from '../agents/summarizer/index.js';

const router: Router = Router();

router.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

router.use('/auth', authRoutes);
router.use('/workspaces', workspaceRoutes);
router.use('/users', userRoutes);
router.use('/documents', documentRoutes);
router.use('/chats', chatRoutes);
router.use('/configuration', configurationRoutes);
router.use('/summarizer', summarizerRoutes);

export { router as apiRouter };
