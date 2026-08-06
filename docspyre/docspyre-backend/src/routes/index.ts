import { Router } from 'express';
import { authRoutes } from '../modules/auth/auth.routes';
import { workspaceRoutes } from '../modules/workspaces/workspace.routes';
import { userRoutes } from '../modules/users/users.routes';
import { documentRoutes } from '../modules/documents/document.routes';
import { shareRoutes } from '../modules/shares/share.routes';
import { chatRoutes } from '../modules/chat/chat.routes';
import { configurationRoutes } from '../modules/configuration/configuration.routes';

/**
 * API v1 router. New feature modules (workspaces, documents, ...) mount here,
 * keeping versioning and route composition in one place.
 */
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

export { router as apiRouter };
