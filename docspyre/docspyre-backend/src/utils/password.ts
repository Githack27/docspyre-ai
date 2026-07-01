import bcrypt from 'bcryptjs';
import { env } from '../config';

/**
 * Password hashing utilities. bcrypt is used with a configurable work factor
 * (default 12) so the cost can scale with hardware over time. Raw passwords
 * never leave this module.
 */
export const hashPassword = (plainPassword: string): Promise<string> =>
  bcrypt.hash(plainPassword, env.BCRYPT_SALT_ROUNDS);

export const verifyPassword = (
  plainPassword: string,
  passwordHash: string,
): Promise<boolean> => bcrypt.compare(plainPassword, passwordHash);
