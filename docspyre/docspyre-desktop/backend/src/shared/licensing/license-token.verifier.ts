import { createRemoteJWKSet, jwtVerify } from 'jose';
import { z } from 'zod';
import { LICENSE_PORTAL_PATHS, LICENSE_TOKEN } from '../../constants/licenseConstants.js';
import { ApiError } from '../../core/utils/api-error.js';

const nullableText = (max: number) => z.string().max(max).nullable();
const claimsSchema = z.object({
  sub: z.string().uuid(),
  jti: z.string().uuid(),
  iat: z.number().int(),
  exp: z.number().int(),
  tokenType: z.literal('license'),
  license: z.object({
    id: z.string().uuid(),
    product: z.string().min(1),
    type: z.string().min(1).max(30),
    name: z.string().min(1).max(80).optional(),
    billing: z.string().min(1).max(20),
    expiresAt: z.string().datetime({ offset: true }).nullable(),
  }),
  user: z.object({
    username: z.string().min(1).max(64),
    email: z.string().email().max(254),
    displayName: z.string().min(1).max(120),
    firstName: nullableText(60),
    lastName: nullableText(60),
    companyName: nullableText(120),
    country: z.string().length(2).nullable(),
    state: nullableText(120),
  }),
});

export type LicenseClaims = z.infer<typeof claimsSchema>;

/**
 * Verifies license tokens offline against the portal's published Ed25519 keys. The key set is fetched once
 * and cached, so sign-in costs one portal round trip and no request after it needs the portal at all.
 */
export class LicenseTokenVerifier {
  private readonly keys: ReturnType<typeof createRemoteJWKSet>;

  constructor(private readonly options: { portalUrl: string; issuer: string; audience: string; timeoutMs: number }) {
    this.keys = createRemoteJWKSet(new URL(LICENSE_PORTAL_PATHS.jwks, options.portalUrl), { timeoutDuration: options.timeoutMs });
  }

  async verify(token: string): Promise<LicenseClaims> {
    try {
      const { payload } = await jwtVerify(token, this.keys, {
        algorithms: [LICENSE_TOKEN.algorithm],
        typ: LICENSE_TOKEN.type,
        issuer: this.options.issuer,
        audience: this.options.audience,
        requiredClaims: ['sub', 'jti', 'iat', 'exp'],
        clockTolerance: LICENSE_TOKEN.clockToleranceSeconds,
      });
      return claimsSchema.parse(payload);
    } catch {
      throw new ApiError(502, 'BAD_GATEWAY', 'The license issued by the DETQEL License Portal could not be verified.');
    }
  }
}

/** True while the user holds a verified, unexpired license. Checked on every authenticated request. */
export function hasActiveLicense(user: { licenseId: string | null; licenseExpiresAt: Date | null }, now = Date.now()): boolean {
  return Boolean(user.licenseId && user.licenseExpiresAt && user.licenseExpiresAt.getTime() > now);
}

