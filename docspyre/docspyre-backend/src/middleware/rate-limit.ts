import rateLimit from 'express-rate-limit';

/**
 * Conservative default limiter applied to the whole API as a baseline DoS
 * guard.
 */
export const globalRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMITED', message: 'Too many requests' } },
});

/**
 * Stricter limiter for credential endpoints (login/register) to slow down
 * brute-force and credential-stuffing attempts.
 */
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: { code: 'RATE_LIMITED', message: 'Too many attempts, try again later' },
  },
});
