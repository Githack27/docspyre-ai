import { randomBytes, createHmac } from 'node:crypto';
import { env } from '../config';

/** Generates a cryptographically random opaque token (base64url, 48 bytes). */
export const generateRefreshToken = (): string =>
  randomBytes(48).toString('base64url');

/** One-way HMAC so a DB leak cannot recreate valid tokens. */
export const hashRefreshToken = (token: string): string =>
  createHmac('sha256', env.JWT_REFRESH_SECRET).update(token).digest('hex');

/** Date at which a newly issued refresh token should expire. */
export const refreshTokenExpiry = (): Date =>
  new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);
