import crypto from 'node:crypto';
import { env } from '../config';

const ALGORITHM = 'aes-256-gcm';

export function encrypt(text: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, Buffer.from(env.ENCRYPTION_KEY), iv);
  
  const encrypted = Buffer.concat([
    cipher.update(Buffer.from(text, 'utf8')),
    cipher.final()
  ]);
  
  const authTag = cipher.getAuthTag();
  
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

/**
 * Decrypts a combined iv:authTag:encryptedHex string using AES-256-GCM.
 */
export function decrypt(encryptedText: string): string {
  const parts = encryptedText.split(':');
  const ivHex = parts[0];
  const authTagHex = parts[1];
  const encryptedHex = parts[2];

  if (!ivHex || !authTagHex || !encryptedHex) {
    throw new Error('Invalid encrypted text format');
  }
  
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  
  const decipher = crypto.createDecipheriv(ALGORITHM, Buffer.from(env.ENCRYPTION_KEY), iv);
  decipher.setAuthTag(authTag);
  
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedHex, 'hex')),
    decipher.final()
  ]).toString('utf8');
  
  return decrypted;
}
