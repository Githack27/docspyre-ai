import { isProduction } from '../config';

type LogLevel = 'info' | 'warn' | 'error' | 'debug';

const format = (level: LogLevel, message: string, meta?: Record<string, unknown>): string => {
  if (isProduction) {
    return JSON.stringify({ level, message, ...meta, timestamp: new Date().toISOString() });
  }
  const metaStr = meta ? ` ${JSON.stringify(meta)}` : '';
  return `[${level.toUpperCase()}] ${message}${metaStr}`;
};

export const logger = {
  info(message: string, meta?: Record<string, unknown>): void {
    console.log(format('info', message, meta));
  },
  warn(message: string, meta?: Record<string, unknown>): void {
    console.warn(format('warn', message, meta));
  },
  error(message: string, meta?: Record<string, unknown>): void {
    console.error(format('error', message, meta));
  },
  debug(message: string, meta?: Record<string, unknown>): void {
    if (!isProduction) console.debug(format('debug', message, meta));
  },
};
