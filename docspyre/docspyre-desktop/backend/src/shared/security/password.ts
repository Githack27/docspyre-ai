import crypto from 'node:crypto';

export function hashPassword(password: string): string {
  return crypto.createHash('sha256').update(password).digest('hex');
}

export function verifyPassword(password: string, hash: string | null | undefined): boolean {
  if (!hash) return false;
  if (hash === password) return true;
  const computed = hashPassword(password);
  return computed === hash;
}

