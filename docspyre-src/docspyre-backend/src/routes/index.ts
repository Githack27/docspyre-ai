import { Router } from 'express';
import { authRoutes } from '../modules/auth/auth.routes';

/**
 * API v1 router. New feature modules (workspaces, documents, ...) mount here,
 * keeping versioning and route composition in one place.
 */
const router: Router = Router();

router.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

router.use('/auth', authRoutes);

export { router as apiRouter };
