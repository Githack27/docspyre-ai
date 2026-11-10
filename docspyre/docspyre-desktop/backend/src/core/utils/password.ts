import bcrypt from 'bcryptjs';
import { env } from '../config';

export const hashPassword = (plaintext: string): Promise<string> =>
  bcrypt.hash(plaintext, env.BCRYPT_SALT_ROUNDS);

export const verifyPassword = (plaintext: string, hash: string): Promise<boolean> =>
  bcrypt.compare(plaintext, hash);
