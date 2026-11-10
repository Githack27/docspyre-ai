import { Router } from 'express';
import { authRoutes } from '../modules/auth';
import { workspaceRoutes } from '../modules/workspaces';
import { userRoutes } from '../modules/users';
import { documentRoutes } from '../modules/documents';
import { shareRoutes } from '../modules/shares';
import { chatRoutes } from '../modules/chat';
import { configurationRoutes } from '../modules/configuration';
import { summarizerRoutes } from '../agents/summarizer';

const router: Router = Router();

router.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

router.use('/auth', authRoutes);
router.use('/workspaces', workspaceRoutes);
router.use('/users', userRoutes);
router.use('/documents', documentRoutes);
router.use('/shares', shareRoutes);
router.use('/chats', chatRoutes);
router.use('/configuration', configurationRoutes);
router.use('/summarizer', summarizerRoutes);

export { router as apiRouter };
