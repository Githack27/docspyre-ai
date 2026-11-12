export const AUTHORIZATION_HEADER = 'authorization';
export const BEARER_AUTHORIZATION_PREFIX = 'Bearer ';
export const MAX_AUTHORIZATION_HEADER_LENGTH = 4_096;
export const ENCODED_SECRET_MINIMUM_LENGTH = 32;

export const SESSION_CRYPTO = {
  algorithm: 'sha256',
  keyBytes: 32,
  nonceBytes: 16,
  encoding: 'base64url',
  millisecondsPerSecond: 1_000,
} as const;

