import { isProduction } from '../config';

/**
 * Minimal structured logger. Kept dependency-free for now; the single call
 * site makes it easy to swap for pino/winston later without touching callers.
 */
type LogMeta = Record<string, unknown>;

const write = (level: string, message: string, meta?: LogMeta): void => {
  const entry = {
    level,
    message,
    timestamp: new Date().toISOString(),
    ...(meta ?? {}),
  };
  const line = isProduction ? JSON.stringify(entry) : `[${level}] ${message}`;
  if (level === 'error') {
    console.error(line, !isProduction && meta ? meta : '');
  } else {
    console.log(line, !isProduction && meta ? meta : '');
  }
};

export const logger = {
  info: (message: string, meta?: LogMeta) => write('info', message, meta),
  warn: (message: string, meta?: LogMeta) => write('warn', message, meta),
  error: (message: string, meta?: LogMeta) => write('error', message, meta),
};
