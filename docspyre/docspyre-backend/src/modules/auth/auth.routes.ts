import { Router } from 'express';
import { authController } from './auth.controller';
import { loginSchema, registerSchema } from './auth.validation';
import { authenticate, authRateLimiter, validate } from '../../core/middleware';

const router: Router = Router();

router.post('/register', authRateLimiter, validate({ body: registerSchema }), authController.register);
router.post('/login', authRateLimiter, validate({ body: loginSchema }), authController.login);
router.post('/refresh', authController.refresh);
router.post('/logout', authController.logout);
router.get('/me', authenticate, authController.me);

export { router as authRoutes };
