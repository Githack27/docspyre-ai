import multer from 'multer';
import { env } from '../../core/config';

export const uploadMiddleware = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.MAX_UPLOAD_BYTES },
});
