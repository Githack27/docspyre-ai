import { randomUUID } from 'node:crypto';
import { createReadStream, existsSync } from 'node:fs';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { env } from '../../config';

/** Absolute root of the on-disk upload store. */
const uploadRoot = path.isAbsolute(env.UPLOAD_DIR)
  ? env.UPLOAD_DIR
  : path.resolve(process.cwd(), env.UPLOAD_DIR);

export async function ensureUploadDir(): Promise<void> {
  await mkdir(uploadRoot, { recursive: true });
}

/** Extracts a safe, lower-cased extension from an original filename. */
function extFromName(name: string): string {
  const ext = path.extname(name);
  return /^\.[a-z0-9]{1,12}$/i.test(ext) ? ext.toLowerCase() : '';
}

/** Persists a buffer under an opaque key and returns that key. */
export async function saveBuffer(originalName: string, buffer: Buffer): Promise<string> {
  await ensureUploadDir();
  const storageKey = `${randomUUID()}${extFromName(originalName)}`;
  await writeFile(path.join(uploadRoot, storageKey), buffer);
  return storageKey;
}

/** Resolves a storage key to an absolute path, guarding against traversal. */
export function storagePath(storageKey: string): string {
  return path.join(uploadRoot, path.basename(storageKey));
}

export function storageExists(storageKey: string): boolean {
  return existsSync(storagePath(storageKey));
}

export function streamFile(storageKey: string): NodeJS.ReadableStream {
  return createReadStream(storagePath(storageKey));
}

/** Idempotently removes a stored file (missing files are ignored). */
export async function removeFile(storageKey: string): Promise<void> {
  try {
    await unlink(storagePath(storageKey));
  } catch {
    // Already gone — safe for repeated purges.
  }
}
