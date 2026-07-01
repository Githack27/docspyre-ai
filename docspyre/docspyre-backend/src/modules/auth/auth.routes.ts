import { Router } from 'express';
import { authController } from './auth.controller';
import { loginSchema, registerSchema } from './auth.validation';
import { authenticate, authRateLimiter, validate } from '../../middleware';

/**
 * Routes for the auth module. Credential endpoints carry the stricter rate
 * limiter; `/me` is protected by the access-token guard.
 */
const router: Router = Router();

router.post(
  '/register',
  authRateLimiter,
  validate({ body: registerSchema }),
  authController.register,
);

router.post(
  '/login',
  authRateLimiter,
  validate({ body: loginSchema }),
  authController.login,
);

router.post('/refresh', authController.refresh);
router.post('/logout', authController.logout);
router.get('/me', authenticate, authController.me);

export { router as authRoutes };
