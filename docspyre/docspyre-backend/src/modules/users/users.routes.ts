import { Router } from 'express';
import { usersController } from './users.controller';
import { authenticate } from '../../core/middleware';

const router: Router = Router();
router.use(authenticate);
router.get('/search', usersController.search);

export { router as userRoutes };
