import { UserLicense } from './auth.models';

const DAY_MS = 86_400_000;

/** Midnight of the given instant in the user's local time zone. */
const startOfLocalDay = (time: number): number => {
  const date = new Date(time);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
};

/**
 * Whole calendar days from today until the license ends, so a 365-day license reads 365 on the day it is granted
 * and 364 the next day. Null when the license has no end date.
 */
export function licenseDaysRemaining(expiresAt: string | null, now: number): number | null {
  if (!expiresAt) return null;
  const end = new Date(expiresAt).getTime();
  if (Number.isNaN(end)) return null;
  if (end <= now) return 0;
  return Math.round((startOfLocalDay(end) - startOfLocalDay(now)) / DAY_MS);
}

/** "Enterprise" from the portal's display name, falling back to the plan code ("ENTERPRISE"). */
export function licenseName(license: UserLicense | null | undefined): string {
  const name = license?.name?.trim();
  if (name) return name;
  const code = license?.type?.trim();
  if (!code) return 'No license';
  return code.charAt(0).toUpperCase() + code.slice(1).toLowerCase();
}

/** "365 days", "1 day", "Expires today", "Expired" or "No expiry". */
export function licenseValidity(license: UserLicense | null | undefined, now: number): string {
  if (!license) return '';
  if (!license.expiresAt) return 'No expiry';
  if (new Date(license.expiresAt).getTime() <= now) return 'Expired';
  const days = licenseDaysRemaining(license.expiresAt, now) ?? 0;
  if (days === 0) return 'Expires today';
  return `${days} ${days === 1 ? 'day' : 'days'}`;
}
