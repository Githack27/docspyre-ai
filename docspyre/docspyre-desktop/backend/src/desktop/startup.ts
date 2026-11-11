import { randomInt } from 'node:crypto';
import type { Application } from 'express';
import type { Server } from 'node:http';
import {
  DESKTOP_IPC,
  DESKTOP_RETRYABLE_PORT_ERRORS,
  DESKTOP_STARTUP_SETTINGS,
  type DesktopStartupStatus,
} from '../constants/desktopConstants.js';
import { DEFAULT_SERVICE_HOST_PORTS, LOOPBACK_HOST, PRIVATE_PORT_RANGE } from '../constants/networkConstants.js';

export { DESKTOP_STARTUP_STEPS } from '../constants/desktopConstants.js';

export interface DesktopStartupStep {
  id: string;
  label: string;
  status: DesktopStartupStatus;
  detail: string | null;
}

export function emitStartupStep(step: DesktopStartupStep): void {
  process.stdout.write(`${JSON.stringify({ type: DESKTOP_IPC.startupEventType, step })}\n`);
}

export async function listenOnPrivatePort(
  app: Application,
): Promise<{ server: Server; address: string; port: number }> {
  const ports = new Set<number>();
  const preferredPort = DEFAULT_SERVICE_HOST_PORTS.api;
  while (ports.size < DESKTOP_STARTUP_SETTINGS.apiPortAllocationAttempts) {
    const port = ports.size === 0 ? preferredPort : randomInt(PRIVATE_PORT_RANGE.minimum, PRIVATE_PORT_RANGE.maximum + 1);
    if (ports.has(port)) continue;
    ports.add(port);
    try {
      const server = await new Promise<Server>((resolve, reject) => {
        const s = app.listen(port, LOOPBACK_HOST, () => {
          resolve(s);
        });
        s.once('error', (err) => {
          reject(err);
        });
      });
      return { server, address: `http://${LOOPBACK_HOST}:${port}`, port };
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === undefined || !DESKTOP_RETRYABLE_PORT_ERRORS.includes(code)) throw error;
    }
  }
  throw new Error(
    `No available private application port in the configured ${PRIVATE_PORT_RANGE.minimum}–${PRIVATE_PORT_RANGE.maximum} range`,
  );
}

