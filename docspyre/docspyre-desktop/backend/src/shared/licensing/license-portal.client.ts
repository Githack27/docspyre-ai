import { z } from 'zod';
import { LICENSE_PORTAL_HEADERS, LICENSE_PORTAL_PATHS } from '../../constants/licenseConstants.js';
import { ApiError } from '../../core/utils/api-error.js';

export interface PortalRegistration {
  firstName: string;
  lastName: string;
  username: string;
  email: string;
  companyName: string;
  password: string;
  phone: string;
  country: string;
  state: string;
  licensePlanId: string;
}

/** Describes this installation to the portal's activation log. */
export interface PortalClientMetadata {
  appVersion?: string;
  deviceName?: string;
  platform?: string;
}

const licenseOptionSchema = z.object({
  id: z.string().uuid(),
  code: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  billing: z.string(),
  durationDays: z.number().int().nullable(),
});

/** A license the portal offers for DocSpyre, shown in the registration form. */
export type PortalLicenseOption = z.infer<typeof licenseOptionSchema>;

const licenseOptionsSchema = z.object({ items: z.array(licenseOptionSchema).max(100) });
const registrationResultSchema = z.object({ status: z.string(), licenseId: z.string().uuid(), message: z.string() });
const loginResultSchema = z.object({ token: z.string().min(1).max(8_192), expiresAt: z.string() });
const portalErrorSchema = z.object({ error: z.object({ code: z.string(), message: z.string() }) });

/** Statuses whose portal message is written for the end user and can be shown as is. */
const USER_FACING_STATUSES = new Set([400, 401, 403, 409, 429]);

/**
 * Server-to-server client for the DETQEL License Portal. The product key never leaves this backend, and
 * redirects are refused so the key cannot be forwarded to another host.
 */
export class LicensePortalClient {
  constructor(private readonly options: { baseUrl: string; productKey: string | undefined; timeoutMs: number }) {}

  /** The licenses the portal currently offers for DocSpyre. */
  async licenseOptions(): Promise<PortalLicenseOption[]> {
    return (await this.request('GET', LICENSE_PORTAL_PATHS.licenses, undefined, licenseOptionsSchema)).items;
  }

  register(registration: PortalRegistration) {
    return this.request('POST', LICENSE_PORTAL_PATHS.register, registration, registrationResultSchema);
  }

  login(username: string, password: string, client: PortalClientMetadata) {
    return this.request('POST', LICENSE_PORTAL_PATHS.login, { username, password, client }, loginResultSchema);
  }

  private async request<T>(method: 'GET' | 'POST', path: string, body: unknown, schema: z.ZodType<T>): Promise<T> {
    if (!this.options.productKey) {
      throw new ApiError(503, 'SERVICE_UNAVAILABLE', 'DocSpyre is not connected to the DETQEL License Portal. Set LICENSE_PORTAL_PRODUCT_KEY and restart.');
    }
    let response: Response;
    try {
      response = await fetch(new URL(path, this.options.baseUrl), {
        method,
        redirect: 'error',
        signal: AbortSignal.timeout(this.options.timeoutMs),
        headers: {
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
          [LICENSE_PORTAL_HEADERS.productKey]: this.options.productKey,
          [LICENSE_PORTAL_HEADERS.requestedWith]: LICENSE_PORTAL_HEADERS.requestedWithValue,
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    } catch {
      throw new ApiError(503, 'SERVICE_UNAVAILABLE', 'The DETQEL License Portal could not be reached. Check your connection and try again.');
    }
    const payload: unknown = await response.json().catch(() => null);
    if (!response.ok) throw this.failure(response.status, payload);
    const parsed = schema.safeParse(payload);
    if (!parsed.success) throw new ApiError(502, 'BAD_GATEWAY', 'The DETQEL License Portal returned an unexpected response.');
    return parsed.data;
  }

  private failure(status: number, payload: unknown): ApiError {
    const error = portalErrorSchema.safeParse(payload);
    const code = error.success ? error.data.error.code : undefined;
    // A rejected product key is an installation problem, not the user's credentials.
    if (code === 'PRODUCT_UNAUTHORIZED') {
      return new ApiError(503, 'PRODUCT_UNAUTHORIZED', "The DETQEL License Portal did not accept this DocSpyre installation's product key.");
    }
    if (error.success && USER_FACING_STATUSES.has(status)) {
      return new ApiError(status, code ?? 'PORTAL_ERROR', error.data.error.message, { code });
    }
    return new ApiError(502, 'BAD_GATEWAY', 'The DETQEL License Portal could not complete the request. Try again shortly.');
  }
}

