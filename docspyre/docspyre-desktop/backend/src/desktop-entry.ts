// The parent owns configuration and process lifetime; stdout carries startup events only.
import { createInterface } from 'node:readline';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import type { Server } from 'node:http';
import { APPLICATION_NAME } from './constants/commonConstants.js';
import {
  DESKTOP_ENVIRONMENT_KEYS,
  DESKTOP_FILES,
  DESKTOP_IPC,
  DESKTOP_PLATFORM,
  DESKTOP_PROTECTED_ENVIRONMENT_KEYS,
  DESKTOP_STARTUP_SETTINGS,
  DESKTOP_STARTUP_STATUS,
  DESKTOP_STARTUP_STEP_IDS,
  DESKTOP_VALIDATION,
  type DesktopReportedStartupStatus,
} from './constants/desktopConstants.js';
import { OLLAMA_EMBEDDING_MODEL } from './constants/dockerConstants.js';
import { LOOPBACK_HOST } from './constants/networkConstants.js';
import {
  DesktopInfrastructureError,
  ensureDesktopInfrastructure,
  stopDesktopInfrastructure,
} from './desktop/infrastructure/desktop-infrastructure.js';
import { DESKTOP_STARTUP_STEPS, emitStartupStep, listenOnPrivatePort } from './desktop/startup.js';
import { prepareApplicationDatabase } from './desktop/infrastructure/application-database.js';
import { writeDesktopLog } from './shared/logging/desktop-logs.js';
import { connectDatabase, disconnectDatabase } from './db/client.js';

const input = createInterface({ input: process.stdin });
const startup = new AbortController();
let server: Server | undefined;
let parentClosed = false;
let stopping = false;
let currentStep: string | undefined;

async function shutdown(): Promise<void> {
  if (stopping) return;
  stopping = true;
  startup.abort();

  try {
    if (server) {
      await new Promise<void>((resolve) => {
        server?.close(() => resolve());
      });
    }
  } catch {}

  try {
    await disconnectDatabase();
  } catch {}

  const runtimeDirectory = process.env[DESKTOP_ENVIRONMENT_KEYS.runtimeDirectory];
  try {
    if (runtimeDirectory) await stopDesktopInfrastructure({ runtimeDirectory });
  } catch {} finally {
    input.close();
  }
}

input.on('close', () => {
  parentClosed = true;
  void shutdown();
});

input.on('line', (line) => {
  if (line === DESKTOP_IPC.shutdownCommand) void shutdown();
});

for (const signal of DESKTOP_IPC.shutdownSignals) {
  process.once(signal, () => {
    void shutdown();
  });
}

function report(id: string, status: DesktopReportedStartupStatus, detail: string | null): void {
  const step = DESKTOP_STARTUP_STEPS.find((item) => item.id === id);
  if (!step) throw new Error('Unknown desktop startup step');
  if (status === DESKTOP_STARTUP_STATUS.running) currentStep = id;
  void writeDesktopLog(
    'desktop.startup.stage',
    { id, status, detail },
    {
      level: status === DESKTOP_STARTUP_STATUS.error ? 'error' : 'info',
    },
  );
  emitStartupStep({ ...step, status, detail });
}

async function main(): Promise<void> {
  void writeDesktopLog('desktop.backend.initializing');
  const initialization = await new Promise<string>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error('Desktop initialization timed out')),
      DESKTOP_STARTUP_SETTINGS.initializationTimeoutMs,
    );
    input.once('line', (line) => {
      clearTimeout(timer);
      resolve(line);
    });
    input.once('close', () => {
      clearTimeout(timer);
      reject(new Error('Desktop parent disconnected'));
    });
  });

  const { token } = JSON.parse(initialization) as { token: string };
  if (!DESKTOP_VALIDATION.startupToken.test(token)) throw new Error('Invalid desktop initialization');

  for (const step of DESKTOP_STARTUP_STEPS) {
    if (step.id !== DESKTOP_STARTUP_STEP_IDS.frontend && step.id !== DESKTOP_STARTUP_STEP_IDS.backendRuntime) {
      emitStartupStep({ ...step, status: DESKTOP_STARTUP_STATUS.pending, detail: null });
    }
  }

  report(DESKTOP_STARTUP_STEP_IDS.backendRuntime, DESKTOP_STARTUP_STATUS.running, null);
  const configPath = process.env[DESKTOP_ENVIRONMENT_KEYS.configurationPath];
  const runtimeDirectory = process.env[DESKTOP_ENVIRONMENT_KEYS.runtimeDirectory];
  if (!configPath || !runtimeDirectory) throw new Error('Desktop configuration paths are missing');

  try {
    const { parse } = await import('dotenv');
    const values = parse(await readFile(configPath));
    for (const [key, value] of Object.entries(values)) {
      if (!DESKTOP_PROTECTED_ENVIRONMENT_KEYS.includes(key) && process.env[key] === undefined) {
        process.env[key] = value;
      }
    }
  } catch {
    // Config file might not exist yet; defaults will be used
  }

  // Ensure required secrets have desktop defaults if not provided in config
  if (!process.env.JWT_ACCESS_SECRET) {
    process.env.JWT_ACCESS_SECRET = 'docspyre-desktop-jwt-access-secret-32-chars-long';
  }
  if (!process.env.JWT_REFRESH_SECRET) {
    process.env.JWT_REFRESH_SECRET = 'docspyre-desktop-jwt-refresh-secret-32-chars-long';
  }
  if (!process.env.ENCRYPTION_KEY) {
    process.env.ENCRYPTION_KEY = 'docspyre-secure-encrypt-key-32ch';
  }

  process.env[DESKTOP_ENVIRONMENT_KEYS.host] = LOOPBACK_HOST;
  process.env[DESKTOP_ENVIRONMENT_KEYS.port] = String(DESKTOP_STARTUP_SETTINGS.initialApiPort);
  process.env[DESKTOP_ENVIRONMENT_KEYS.nodeEnvironment] = DESKTOP_PLATFORM.production;
  process.env[DESKTOP_ENVIRONMENT_KEYS.enabled] = DESKTOP_PLATFORM.enabledMarker;
  await writeDesktopLog('desktop.configuration.loaded', { configurationPath: configPath });
  report(DESKTOP_STARTUP_STEP_IDS.backendRuntime, DESKTOP_STARTUP_STATUS.complete, null);

  const infrastructure = await ensureDesktopInfrastructure({
    runtimeDirectory,
    assetsDirectory: fileURLToPath(new URL(DESKTOP_FILES.infrastructureAssets, import.meta.url)),
    report: (step) => {
      if (step.status === DESKTOP_STARTUP_STATUS.running) currentStep = step.id;
      emitStartupStep(step);
    },
    signal: startup.signal,
  });

  if (startup.signal.aborted) return;

  // Infrastructure credentials
  process.env[DESKTOP_ENVIRONMENT_KEYS.litellmBaseUrl] = infrastructure.litellmUrl;
  process.env[DESKTOP_ENVIRONMENT_KEYS.litellmApiKey] = infrastructure.litellmMasterKey;
  process.env[DESKTOP_ENVIRONMENT_KEYS.milvusAddress] = infrastructure.milvusUrl;
  process.env[DESKTOP_ENVIRONMENT_KEYS.milvusToken] = infrastructure.milvusToken;
  process.env[DESKTOP_ENVIRONMENT_KEYS.ollamaBaseUrl] = infrastructure.ollamaUrl;
  process.env[DESKTOP_ENVIRONMENT_KEYS.ollamaEmbeddingModel] = OLLAMA_EMBEDDING_MODEL;

  report(DESKTOP_STARTUP_STEP_IDS.applicationDatabase, DESKTOP_STARTUP_STATUS.running, null);
  await prepareApplicationDatabase({
    databaseUrl: infrastructure.applicationDatabaseUrl,
    signal: startup.signal,
    report: (detail) => report(DESKTOP_STARTUP_STEP_IDS.applicationDatabase, DESKTOP_STARTUP_STATUS.running, detail),
  });

  process.env[DESKTOP_ENVIRONMENT_KEYS.databaseUrl] = infrastructure.applicationDatabaseUrl;

  await connectDatabase(infrastructure.applicationDatabaseUrl);
  report(
    DESKTOP_STARTUP_STEP_IDS.applicationDatabase,
    DESKTOP_STARTUP_STATUS.complete,
    'Database schema deployed and database is ready',
  );

  if (parentClosed || startup.signal.aborted) {
    return;
  }

  currentStep = DESKTOP_STARTUP_STEP_IDS.backendApi;
  report(DESKTOP_STARTUP_STEP_IDS.backendApi, DESKTOP_STARTUP_STATUS.running, 'Initializing DocSpyre API');

  const { createApp } = await import('./app.js');
  const app = createApp({ desktopToken: token, isDesktop: true });

  report(DESKTOP_STARTUP_STEP_IDS.backendApi, DESKTOP_STARTUP_STATUS.running, 'Starting the private DocSpyre API');
  const listened = await listenOnPrivatePort(app);
  server = listened.server;

  if (parentClosed || startup.signal.aborted) {
    server.close();
    return;
  }

  report(DESKTOP_STARTUP_STEP_IDS.backendApi, DESKTOP_STARTUP_STATUS.complete, 'Workspace is ready');
  process.stdout.write(JSON.stringify({ ready: true, address: listened.address }) + '\n');
  await writeDesktopLog('desktop.backend.ready', { address: listened.address });
}

main().catch(async (error) => {
  process.exitCode = 1;
  if (!stopping && !parentClosed) {
    await writeDesktopLog(
      'desktop.startup.failed',
      {
        step: currentStep,
        error: error instanceof Error ? error.stack : String(error),
      },
      { level: 'error' },
    );
    const message =
      error instanceof DesktopInfrastructureError
        ? error.message
        : currentStep === DESKTOP_STARTUP_STEP_IDS.applicationDatabase
          ? `Application database startup failed: ${error instanceof Error ? error.message : String(error)}`
          : currentStep === DESKTOP_STARTUP_STEP_IDS.backendApi
            ? `Desktop API service startup failed: ${error instanceof Error ? error.message : String(error)}`
            : `Desktop startup failed. Check your runtime configuration and restart ${APPLICATION_NAME}.`;
    if (currentStep && DESKTOP_STARTUP_STEPS.some((step) => step.id === currentStep)) {
      report(currentStep, DESKTOP_STARTUP_STATUS.error, message);
    }
    process.stdout.write(JSON.stringify({ ready: false, error: message }) + '\n');
  }
  await shutdown();
});

