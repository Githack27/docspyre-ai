import crypto from 'node:crypto';
import { env } from '../config';

/**
 * Refresh tokens are high-entropy opaque strings (not JWTs). The raw value is
 * returned to the client once and only its HMAC is persisted, so a database
 * leak alone cannot be used to forge or replay a session.
 */
export const generateRefreshToken = (): string =>
  crypto.randomBytes(48).toString('base64url');

/** Deterministic, keyed hash used to look up / store refresh tokens. */
export const hashRefreshToken = (rawToken: string): string =>
  crypto
    .createHmac('sha256', env.JWT_REFRESH_SECRET)
    .update(rawToken)
    .digest('hex');

export const refreshTokenExpiry = (): Date => {
  const expires = new Date();
  expires.setDate(expires.getDate() + env.REFRESH_TOKEN_TTL_DAYS);
  return expires;
};
