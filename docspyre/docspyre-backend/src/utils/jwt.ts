import jwt, { type JwtPayload, type SignOptions } from 'jsonwebtoken';
import { env } from '../config';
import { ApiError } from './api-error';

/** Claims embedded in the short-lived access token. */
export interface AccessTokenPayload {
  sub: string; // user id
  sid: string; // session id (enables server-side revocation checks)
}

export const signAccessToken = (payload: AccessTokenPayload): string =>
  jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    expiresIn: env.ACCESS_TOKEN_TTL,
    issuer: 'docspyre',
  } as SignOptions);

export const verifyAccessToken = (token: string): AccessTokenPayload => {
  try {
    const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET, {
      issuer: 'docspyre',
    }) as JwtPayload;

    if (typeof decoded.sub !== 'string' || typeof decoded.sid !== 'string') {
      throw ApiError.unauthorized('Malformed access token');
    }
    return { sub: decoded.sub, sid: decoded.sid };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw ApiError.unauthorized('Invalid or expired access token');
  }
};
