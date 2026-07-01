import { PublicUser } from './auth.models';

interface NamedUser {
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
}

export function displayName(user: NamedUser | null | undefined): string {
  if (!user) return 'Guest';
  const full = [user.firstName, user.lastName].filter(Boolean).join(' ').trim();
  return full || user.email || 'Guest';
}

export function userInitials(user: NamedUser | null | undefined): string {
  if (!user) return '';
  const first = (user.firstName ?? '').trim();
  const last = (user.lastName ?? '').trim();
  if (first && last) return (first[0] + last[0]).toUpperCase();
  return displayName(user).slice(0, 2).toUpperCase();
}

export type { PublicUser };
