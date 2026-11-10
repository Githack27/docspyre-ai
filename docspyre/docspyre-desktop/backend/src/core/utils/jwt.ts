import jwt from 'jsonwebtoken';
import { env } from '../config';
import { ApiError } from './api-error';

interface AccessPayload {
  sub: string;
  sid: string;
}

export const signAccessToken = (payload: AccessPayload): string =>
  jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    // Validated as a duration string (e.g. "15m") by the env schema; the
    // jsonwebtoken types model this as a template literal union.
    expiresIn: env.ACCESS_TOKEN_TTL as jwt.SignOptions['expiresIn'],
  });

export const verifyAccessToken = (token: string): AccessPayload => {
  try {
    const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET) as AccessPayload;
    return decoded;
  } catch {
    throw ApiError.unauthorized('Invalid or expired access token');
  }
};
