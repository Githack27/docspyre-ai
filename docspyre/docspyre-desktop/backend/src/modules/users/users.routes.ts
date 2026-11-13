import { Router } from 'express';
import { usersController } from './users.controller.js';
import { authenticate } from '../../core/middleware/index.js';

const router: Router = Router();
router.use(authenticate);
router.get('/search', usersController.search);

export { router as userRoutes };
