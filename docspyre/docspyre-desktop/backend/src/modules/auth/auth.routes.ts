import { Router } from 'express';
import { authController } from './auth.controller.js';
import { loginSchema, registerSchema } from './auth.validation.js';
import { authenticate, authRateLimiter, validate } from '../../core/middleware/index.js';

const router: Router = Router();

router.get('/license-options', authController.licenseOptions);
router.post('/register', authRateLimiter, validate({ body: registerSchema }), authController.register);
router.post('/login', authRateLimiter, validate({ body: loginSchema }), authController.login);
router.post('/logout', authController.logout);
router.get('/me', authenticate, authController.me);

export { router as authRoutes };
