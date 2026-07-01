import multer from 'multer';
import { env } from '../../config';

/**
 * In-memory multipart parsing. Files are held as buffers so the service layer
 * controls where/how they persist (single source of truth for storage).
 */
export const uploadMiddleware = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.MAX_UPLOAD_BYTES, files: 20 },
});
