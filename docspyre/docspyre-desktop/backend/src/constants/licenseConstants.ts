import { LOCALHOST_HOST, LOOPBACK_HOST } from './networkConstants.js';

// The DETQEL License Portal is the single sign-in and license authority for DocSpyre.
export const LICENSE_PORTAL_DEFAULTS = {
  url: `http://${LOOPBACK_HOST}:3012`,
  issuer: 'license-portal',
  audience: 'detqel:docspyre',
  timeoutMs: 10_000,
} as const;

export const LICENSE_PORTAL_PATHS = {
  licenses: '/api/client/licenses',
  register: '/api/client/register',
  login: '/api/client/login',
  jwks: '/api/auth/jwks',
} as const;

export const LICENSE_PORTAL_HEADERS = {
  productKey: 'X-Product-Key',
  requestedWith: 'X-Requested-With',
  requestedWithValue: 'license-portal',
} as const;

// Only plain HTTP to this machine is allowed; every other portal address must use HTTPS.
export const LICENSE_PORTAL_INSECURE_HOSTS: readonly string[] = [LOOPBACK_HOST, LOCALHOST_HOST, '[::1]'];

export const LICENSE_TOKEN = {
  algorithm: 'Ed25519',
  type: 'license+jwt',
  clockToleranceSeconds: 60,
} as const;

export const PORTAL_PASSWORD_LENGTH = { minimum: 12, maximum: 128 } as const;

