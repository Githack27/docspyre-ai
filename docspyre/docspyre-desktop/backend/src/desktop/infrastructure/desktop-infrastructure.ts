import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { DESKTOP_PLATFORM } from "../../constants/desktopConstants.js";
import {
    DESKTOP_INFRASTRUCTURE_LABELS,
    DESKTOP_STARTUP_STATUS,
    DESKTOP_STARTUP_STEP_IDS,
    type DesktopInfrastructureStepId,
    type DesktopStartupStatus,
} from "../../constants/desktopConstants.js";
import {
    DOCKER_ASSET_FILES,
    DOCKER_CONTAINER_STATUS,
    DOCKER_CREDENTIAL_SETTINGS,
    DOCKER_ENVIRONMENT_KEYS,
    DOCKER_HEALTH_ENDPOINTS,
    DOCKER_HEALTH_VALUES,
    DOCKER_INSPECT_FORMATS,
    DOCKER_IMAGE_PULLS,
    DOCKER_LABELS,
    DOCKER_LIMITS,
    DOCKER_LOCAL_ENDPOINT_PROTOCOLS,
    DOCKER_MINIMUM_COMPOSE_MAJOR_VERSION,
    DOCKER_PROTOCOLS,
    DOCKER_PREVIOUS_PROJECT_NAMES,
    DOCKER_RUNTIME_PLATFORM,
    DOCKER_SERVICE_NAMES,
    DOCKER_TIMEOUTS_MS,
    DOCKER_VALIDATION,
    OLLAMA_EMBEDDING_MODEL,
} from "../../constants/dockerConstants.js";
import { LOOPBACK_HOST, PRIVATE_PORT_RANGE, SERVICE_PORTS } from "../../constants/networkConstants.js";
import { resolveContainerRuntime } from "./container-runtime.js";
import {
    createInfrastructureCredentials,
    infrastructureOwnershipFilter,
    infrastructureStackName,
    infrastructureRuntimeId,
    legacyInfrastructureStackName,
    preparePrivateInfrastructureDirectory,
    readInfrastructureCredentials,
    writeInfrastructureConfiguration,
} from "./infrastructure-configuration.js";
import {
    prepareInfrastructureDeployment,
    removeReplacedInfrastructureContainers,
} from "./infrastructure-deployment.js";
import { DesktopInfrastructureError } from "./infrastructure-error.js";
import { prepareInfrastructurePorts } from "./infrastructure-ports.js";
import { runInfrastructureProcess, startupDelay } from "./infrastructure-process.js";
import { writeDesktopLog } from "../../shared/logging/desktop-logs.js";

export { DesktopInfrastructureError } from "./infrastructure-error.js";

/**
 * Ensures the embedding model is installed in the managed Ollama container without blocking startup. Runs in
 * the background: it skips the pull when the model is already present, and logs success or failure rather than
 * throwing, so a slow download or transient network issue degrades retrieval gracefully instead of wedging the
 * whole service sequence. The container itself is health-gated separately before this is invoked.
 */
async function ensureEmbeddingModel(executable: string, ollamaId: string, env: NodeJS.ProcessEnv, signal: AbortSignal): Promise<void> {
    try {
        const installed = await runInfrastructureProcess(executable, ["exec", ollamaId, "ollama", "list"], {
            signal, env, timeoutMs: DOCKER_TIMEOUTS_MS.cli,
            failureMessage: "The installed Ollama models could not be listed.",
        }).catch(() => "");
        if (installed.includes(OLLAMA_EMBEDDING_MODEL)) {
            await writeDesktopLog("desktop.ollama.model.present", { model: OLLAMA_EMBEDDING_MODEL });
            return;
        }
        await runInfrastructureProcess(executable, ["exec", ollamaId, "ollama", "pull", OLLAMA_EMBEDDING_MODEL], {
            signal, env, timeoutMs: DOCKER_TIMEOUTS_MS.modelPull,
            failureMessage: `The ${OLLAMA_EMBEDDING_MODEL} embedding model could not be pulled into Ollama.`,
        });
        await writeDesktopLog("desktop.ollama.model.ready", { model: OLLAMA_EMBEDDING_MODEL });
    } catch (error) {
        // Never surface this as a startup failure; embeddings become available once the model finishes.
        await writeDesktopLog("desktop.ollama.model.deferred", { model: OLLAMA_EMBEDDING_MODEL, reason: error instanceof Error ? error.message : "unknown" });
    }
}

export interface DesktopInfrastructureStep {
    id: string;
    label: string;
    status: DesktopStartupStatus;
    detail: string | null;
}

export interface DesktopInfrastructureOptions {
    runtimeDirectory: string;
    assetsDirectory: string;
    report: (step: DesktopInfrastructureStep) => void;
    signal: AbortSignal;
}

export interface DesktopInfrastructure {
    stackName: string;
    litellmUrl: string;
    litellmMasterKey: string;
    milvusUrl: string;
    milvusToken: string;
    ollamaUrl: string;
    applicationDatabaseUrl: string;
}

/** Best-effort engine launch for the auto-launchable docker runtime. Never throws; podman and nerdctl users start their own engine. */
function launchContainerEngine(platform: NodeJS.Platform): void {
    try {
        if (platform === DESKTOP_PLATFORM.windows) {
            const candidates = [
                "C:\\Program Files\\Docker\\Docker\\Docker Desktop.exe",
                process.env.ProgramFiles ? join(process.env.ProgramFiles, "Docker", "Docker", "Docker Desktop.exe") : null,
                process.env["ProgramFiles(x86)"] ? join(process.env["ProgramFiles(x86)"], "Docker", "Docker", "Docker Desktop.exe") : null,
            ].filter(Boolean) as string[];
            for (const exe of candidates) {
                if (existsSync(exe)) {
                    const child = spawn(exe, [], { detached: true, stdio: "ignore" });
                    child.unref();
                    return;
                }
            }
            return;
        }
        if (platform === "darwin") {
            const child = spawn("open", ["-a", "Docker"], { detached: true, stdio: "ignore" });
            child.unref();
            return;
        }
        if (platform === "linux") {
            const child = spawn("systemctl", ["--user", "start", "docker"], { detached: true, stdio: "ignore" });
            child.unref();
        }
    } catch {}
}

/** Stops only the running containers created for this installation's runtime directory. */
export async function stopDesktopInfrastructure(options: { runtimeDirectory: string; signal?: AbortSignal }): Promise<void> {
    try {
        const signal = options.signal ?? new AbortController().signal;
        const runtime = await resolveContainerRuntime(signal);
        const runningIds = (await runInfrastructureProcess(runtime.executable, [
            "ps", "--filter", infrastructureOwnershipFilter(options.runtimeDirectory), "--format", DOCKER_INSPECT_FORMATS.ids,
        ], { signal, timeoutMs: DOCKER_TIMEOUTS_MS.ownershipCli, failureMessage: "Unable to query running managed containers." })).split(/\r?\n/).filter(Boolean);
        if (runningIds.some(id => !DOCKER_VALIDATION.containerId.test(id))) return;

        if (runningIds.length > 0) {
            await runInfrastructureProcess(runtime.executable, [
                "stop", "--time", String(DOCKER_LIMITS.legacyStopSeconds), ...runningIds
            ], { signal, timeoutMs: DOCKER_TIMEOUTS_MS.legacyReplacement, failureMessage: "Unable to stop running managed containers." });
        }
    } catch {
        // Safe shutdown fallback
    }
}

async function ensureLocalDocker(executable: string, autoLaunch: boolean, signal: AbortSignal, report: (detail: string) => void): Promise<void> {
    const runtime = (args: string[], failureMessage: string, timeoutMs: number = DOCKER_TIMEOUTS_MS.cli) => runInfrastructureProcess(executable, args, { signal, timeoutMs, failureMessage });
    const version = await runtime(["compose", "version", "--short"], "The container runtime's compose plugin is unavailable. Install a current release of your container runtime and enable Linux containers.");
    const major = /^v?(\d+)\./.exec(version)?.[1];
    if (!major || Number(major) < DOCKER_MINIMUM_COMPOSE_MAJOR_VERSION) throw new DesktopInfrastructureError(`A compose plugin of v${DOCKER_MINIMUM_COMPOSE_MAJOR_VERSION} or newer is required. Update your container runtime before starting the application.`);
    let dockerHost: string;
    const configuredHost = process.env[DOCKER_ENVIRONMENT_KEYS.host];
    if (configuredHost !== undefined) dockerHost = configuredHost;
    else {
        const value = await runtime(["context", "inspect", "--format", DOCKER_INSPECT_FORMATS.contextHost], "The local container runtime context could not be read. Select your local runtime context and retry.");
        try { dockerHost = JSON.parse(value) as string; }
        catch { throw new DesktopInfrastructureError("The local container runtime context is invalid. Select your local runtime context and retry."); }
    }
    if (typeof dockerHost !== "string" || !DOCKER_LOCAL_ENDPOINT_PROTOCOLS.some(protocol => dockerHost.startsWith(protocol))) {
        throw new DesktopInfrastructureError("Desktop infrastructure requires a local container runtime context. Remote runtime endpoints are not supported.");
    }
    const engine = () => runtime(["info", "--format", DOCKER_INSPECT_FORMATS.operatingSystem], "The container runtime engine is not ready. Start it with Linux containers and retry.");
    let operatingSystem: string;
    try { operatingSystem = await engine(); }
    catch {
        if (signal.aborted) throw new DesktopInfrastructureError("Desktop infrastructure startup was cancelled.");
        report("Starting the local container engine and waiting for its Linux container runtime...");
        if (autoLaunch) {
            launchContainerEngine(process.platform);
            try {
                await runtime(["desktop", "start", "--detach"], "The container engine could not be started automatically. Start it, wait for its engine, and retry.", DOCKER_TIMEOUTS_MS.desktopStart);
            } catch {
                // Native launch was triggered; continue waiting for engine
            }
        }
        const deadline = Date.now() + DOCKER_TIMEOUTS_MS.desktopStart;
        for (;;) {
            try { operatingSystem = await engine(); break; }
            catch {
                if (signal.aborted) throw new DesktopInfrastructureError("Desktop infrastructure startup was cancelled.");
                if (Date.now() >= deadline) throw new DesktopInfrastructureError("The container engine did not become ready. Start your container runtime and confirm its Linux engine is running.");
                await startupDelay(DOCKER_TIMEOUTS_MS.pollInterval, signal);
            }
        }
    }
    if (operatingSystem !== DOCKER_RUNTIME_PLATFORM) throw new DesktopInfrastructureError("Switch your container runtime to Linux containers before starting the application.");
}

async function infrastructureJson(url: string, options: { signal: AbortSignal; authorization?: string; body?: Record<string, unknown> }): Promise<unknown> {
    const headers = new Headers({ Accept: "application/json" });
    if (options.authorization !== undefined) headers.set("Authorization", `Bearer ${options.authorization}`);
    if (options.body !== undefined) headers.set("Content-Type", "application/json");
    const response = await fetch(url, {
        method: options.body === undefined ? "GET" : "POST",
        headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        redirect: "error",
        signal: AbortSignal.any([options.signal, AbortSignal.timeout(DOCKER_TIMEOUTS_MS.http)]),
    });
    if (!response.ok) {
        await response.body?.cancel();
        throw new DesktopInfrastructureError("The local service rejected its startup readiness or authentication check. Check the managed Docker project and restore its saved credentials if necessary.");
    }
    if (response.body === null) throw new DesktopInfrastructureError("A local service returned an empty startup readiness response.");
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let length = 0;
    try {
        for (;;) {
            const chunk = await reader.read();
            if (chunk.done) break;
            length += chunk.value.byteLength;
            if (length > DOCKER_LIMITS.readinessResponseBytes) {
                await reader.cancel();
                throw new DesktopInfrastructureError("A local service exceeded the allowed startup readiness response size.");
            }
            chunks.push(chunk.value);
        }
    } finally { reader.releaseLock(); }
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
}

function responseObject(value: unknown): Record<string, unknown> | null {
    return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

/**
 * Brings this installation's services up in order. Existing containers are started as they are, missing ones
 * are created from the persistent volumes, and a container is recreated only when its configuration changed.
 */
export async function ensureDesktopInfrastructure(options: DesktopInfrastructureOptions): Promise<DesktopInfrastructure> {
    let phase: DesktopInfrastructureStepId = DESKTOP_STARTUP_STEP_IDS.docker;
    const report = (id: DesktopInfrastructureStepId, status: DesktopInfrastructureStep["status"], detail: string | null) => {
        options.report({ id, label: DESKTOP_INFRASTRUCTURE_LABELS[id], status, detail });
    };
    try {
        report(DESKTOP_STARTUP_STEP_IDS.docker, DESKTOP_STARTUP_STATUS.running, "Preparing private infrastructure configuration and detecting the local container runtime...");
        const directory = await preparePrivateInfrastructureDirectory(options.runtimeDirectory, options.signal);
        const stackName = infrastructureStackName(options.runtimeDirectory);
        const runtime = await resolveContainerRuntime(options.signal);
        const executable = runtime.executable;
        await ensureLocalDocker(executable, runtime.autoLaunch, options.signal, detail => report(DESKTOP_STARTUP_STEP_IDS.docker, DESKTOP_STARTUP_STATUS.running, detail));
        report(DESKTOP_STARTUP_STEP_IDS.docker, DESKTOP_STARTUP_STATUS.complete, "The local Linux container engine is ready.");

        phase = DESKTOP_STARTUP_STEP_IDS.litellmDatabase;
        report(phase, DESKTOP_STARTUP_STATUS.running, "Loading persisted private service credentials...");
        let credentials = await readInfrastructureCredentials(directory);
        if (credentials === null) {
            for (const filter of [
                `label=${DOCKER_LABELS.runtime}=${infrastructureRuntimeId(directory)}`,
                `label=${DOCKER_LABELS.project}=${legacyInfrastructureStackName(options.runtimeDirectory)}`,
                `label=${DOCKER_LABELS.project}=${stackName}`,
                ...DOCKER_PREVIOUS_PROJECT_NAMES.map(name => `label=${DOCKER_LABELS.project}=${name}`),
            ]) {
                const existingVolumes = await runInfrastructureProcess(executable, ["volume", "ls", "--filter", filter, "--format", DOCKER_INSPECT_FORMATS.names], {
                    signal: options.signal, timeoutMs: DOCKER_TIMEOUTS_MS.cli,
                    failureMessage: "Existing managed data volumes could not be checked safely. Confirm your container runtime is available and retry.",
                });
                if (existingVolumes) throw new DesktopInfrastructureError("Managed data exists but its credentials are missing. Restore the private infrastructure directory from backup.");
            }
            credentials = await createInfrastructureCredentials(directory);
        }
        const deployment = await prepareInfrastructureDeployment({ directory, runtimeDirectory: options.runtimeDirectory, executable, signal: options.signal });
        // Download every missing image before removing any working containers. Images already present locally
        // are never re-pulled, so a normal launch needs no registry access and cannot stall on the network.
        for (const image of DOCKER_IMAGE_PULLS) {
            const present = await runInfrastructureProcess(executable, ["image", "inspect", "--format", DOCKER_INSPECT_FORMATS.imageId, image.image], {
                signal: options.signal, timeoutMs: DOCKER_TIMEOUTS_MS.cli,
                failureMessage: `The ${image.service} image could not be checked.`,
            }).then(() => true, () => false);
            if (present) continue;
            phase = image.step;
            report(phase, DESKTOP_STARTUP_STATUS.running, `Downloading the ${image.service} image...`);
            await runInfrastructureProcess(executable, ["pull", image.image], {
                signal: options.signal,
                timeoutMs: DOCKER_TIMEOUTS_MS.imagePull,
                failureMessage: `The ${image.service} image could not be downloaded. See the backend logs.`,
            });
            report(phase, DESKTOP_STARTUP_STATUS.pending, null);
        }
        phase = DESKTOP_STARTUP_STEP_IDS.docker;
        await removeReplacedInfrastructureContainers(deployment, executable, options.signal);
        const ports = await prepareInfrastructurePorts({ directory, signal: options.signal, existingPorts: deployment.publishedPorts });
        const env = await writeInfrastructureConfiguration(directory, options.assetsDirectory, credentials, ports, deployment.litellmDatabaseVolume);
        const composePrefix = ["compose", "--project-name", stackName, "--project-directory", directory, "--file", join(directory, DOCKER_ASSET_FILES.compose), "--env-file", join(directory, DOCKER_ASSET_FILES.environment)];
        const compose = (args: string[], failureMessage: string, timeoutMs: number = DOCKER_TIMEOUTS_MS.cli, onActivity?: () => void) => runInfrastructureProcess(executable, [...composePrefix, ...args], {
            signal: options.signal, cwd: directory, env, timeoutMs, failureMessage, onActivity,
        });

        // Compose creates a missing container, starts an existing one unchanged, and recreates a container only
        // when its configuration differs from what is running. Data lives in named volumes either way.
        const startService = async (service: string, failureMessage: string) => {
            await compose(
                ["up", "--detach", "--no-deps", "--no-build", "--pull", "never", service],
                failureMessage,
                DOCKER_TIMEOUTS_MS.stackStart
            );
        };

        const serviceId = async (service: string): Promise<string> => {
            const ids = (await compose(["ps", "--all", "--quiet", service], "A managed service container could not be located. Retry startup from Docker Desktop.")).split(/\r?\n/).filter(Boolean);
            if (ids.length !== 1 || !DOCKER_VALIDATION.containerId.test(ids[0])) throw new DesktopInfrastructureError("A managed service container could not be identified safely. Check this application's Docker project and retry.");
            return ids[0];
        };
        const inspect = (id: string, format: string) => runInfrastructureProcess(executable, ["inspect", "--format", format, id], {
            signal: options.signal, env, timeoutMs: DOCKER_TIMEOUTS_MS.cli,
            failureMessage: "Managed service health could not be inspected. Confirm your container runtime is running and retry.",
        });
        const ready = async (service: string): Promise<string> => {
            const readinessDeadline = Date.now() + DOCKER_TIMEOUTS_MS.serviceReady;
            const id = await serviceId(service);
            let consecutiveFailures = 0;
            const maxConsecutiveFailures = 15;
            for (;;) {
                const state = await inspect(id, DOCKER_INSPECT_FORMATS.state);
                if (state === `${DOCKER_CONTAINER_STATUS.running}|${DOCKER_CONTAINER_STATUS.healthy}`) return id;
                if (state === `${DOCKER_CONTAINER_STATUS.running}|${DOCKER_CONTAINER_STATUS.unhealthy}` || state.startsWith(`${DOCKER_CONTAINER_STATUS.dead}|`)) {
                    throw new DesktopInfrastructureError(`${service} failed its health check (status: ${state}). Check this container in Docker Desktop and retry.`);
                }
                if (state.startsWith(`${DOCKER_CONTAINER_STATUS.exited}|`) || state.startsWith(`${DOCKER_CONTAINER_STATUS.restarting}|`)) {
                    consecutiveFailures++;
                    if (consecutiveFailures >= maxConsecutiveFailures) {
                        throw new DesktopInfrastructureError(`${service} stopped unexpectedly (status: ${state}). Check this container in Docker Desktop and retry.`);
                    }
                } else {
                    consecutiveFailures = 0;
                }
                if (Date.now() >= readinessDeadline) throw new DesktopInfrastructureError(`${service} did not become ready within the allocated startup time (status: ${state}). Check this container in Docker Desktop and retry.`);
                await startupDelay(DOCKER_TIMEOUTS_MS.pollInterval, options.signal);
            }
        };
        const publishedUrl = async (id: string, targetPort: number): Promise<string> => {
            let bindings: unknown;
            try { bindings = JSON.parse(await inspect(id, DOCKER_INSPECT_FORMATS.ports)); }
            catch (error) { if (error instanceof DesktopInfrastructureError) throw error; throw new DesktopInfrastructureError("A managed service's private host port could not be read safely."); }
            const ports = responseObject(bindings);
            const entries = ports?.[`${targetPort}/tcp`];
            if (!Array.isArray(entries) || entries.length !== 1) throw new DesktopInfrastructureError("A managed service does not have exactly one private loopback port. Startup stopped to prevent an unsafe network connection.");
            const binding = responseObject(entries[0]);
            const port = Number(binding?.HostPort);
            if (binding?.HostIp !== LOOPBACK_HOST || !Number.isInteger(port) || port < PRIVATE_PORT_RANGE.minimum || port > PRIVATE_PORT_RANGE.maximum) {
                throw new DesktopInfrastructureError("A managed service port is outside the private loopback allocation policy. Startup stopped to prevent an unsafe network connection.");
            }
            return `${DOCKER_PROTOCOLS.http}//${LOOPBACK_HOST}:${port}`;
        };

        // 1. LiteLLM Database: Run dedicated PostgreSQL service and wait for it to be healthy
        phase = DESKTOP_STARTUP_STEP_IDS.litellmDatabase;
        report(phase, DESKTOP_STARTUP_STATUS.running, "Starting the dedicated LiteLLM PostgreSQL database...");
        await startService(
            DOCKER_SERVICE_NAMES.litellmDatabase,
            "The private LiteLLM database container could not start. Check Docker Desktop memory, disk space, and this application's Docker project, then retry."
        );
        report(phase, DESKTOP_STARTUP_STATUS.running, "Waiting for the dedicated LiteLLM PostgreSQL database to become healthy...");
        await ready(DOCKER_SERVICE_NAMES.litellmDatabase);
        report(phase, DESKTOP_STARTUP_STATUS.complete, "The private LiteLLM database is healthy.");

        // 2. Milvus Vector Store: Run Milvus service and wait for health & authenticated access verification
        phase = DESKTOP_STARTUP_STEP_IDS.milvus;
        report(phase, DESKTOP_STARTUP_STATUS.running, "Starting the Milvus vector store...");
        await startService(
            DOCKER_SERVICE_NAMES.milvus,
            "The managed Milvus container could not start. Check Docker Desktop memory, disk space, and this application's Docker project, then retry."
        );
        report(phase, DESKTOP_STARTUP_STATUS.running, "Waiting for the Milvus vector store to become healthy...");
        const milvusId = await ready(DOCKER_SERVICE_NAMES.milvus);
        const milvusUrl = await publishedUrl(milvusId, SERVICE_PORTS.milvus);
        const milvusToken = `${DOCKER_CREDENTIAL_SETTINGS.milvusRootUsername}:${credentials.milvusRootPassword}`;
        const milvus = responseObject(await infrastructureJson(`${milvusUrl}${DOCKER_HEALTH_ENDPOINTS.milvusCollections}`, { signal: options.signal, authorization: milvusToken, body: {} }));
        if (milvus?.code !== DOCKER_HEALTH_VALUES.milvusSuccess || !Array.isArray(milvus.data)) throw new DesktopInfrastructureError("Milvus did not pass its authenticated startup check. Restore its saved credentials or inspect the managed Milvus service before retrying.");
        report(phase, DESKTOP_STARTUP_STATUS.complete, "Milvus is healthy and authenticated access is verified.");

        // 3. LiteLLM Gateway: Run LiteLLM gateway service (with LiteLLM DB already verified healthy)
        phase = DESKTOP_STARTUP_STEP_IDS.litellm;
        report(phase, DESKTOP_STARTUP_STATUS.running, "Starting the LiteLLM AI gateway...");
        await startService(
            DOCKER_SERVICE_NAMES.litellm,
            "The managed LiteLLM container could not start. Check Docker Desktop memory, disk space, and this application's Docker project, then retry."
        );
        report(phase, DESKTOP_STARTUP_STATUS.running, "Waiting for LiteLLM database migrations and authenticated gateway readiness...");
        const litellmId = await ready(DOCKER_SERVICE_NAMES.litellm);
        const litellmUrl = await publishedUrl(litellmId, SERVICE_PORTS.litellm);
        const health = responseObject(await infrastructureJson(`${litellmUrl}${DOCKER_HEALTH_ENDPOINTS.litellmReadiness}`, { signal: options.signal }));
        if (health?.status !== DOCKER_HEALTH_VALUES.healthy || health.db !== DOCKER_HEALTH_VALUES.databaseConnected) throw new DesktopInfrastructureError("LiteLLM is not ready with its PostgreSQL database. Check the managed gateway and database services, then retry.");
        const models = responseObject(await infrastructureJson(`${litellmUrl}${DOCKER_HEALTH_ENDPOINTS.litellmModels}`, { signal: options.signal, authorization: credentials.litellmMasterKey }));
        if (!Array.isArray(models?.data)) throw new DesktopInfrastructureError("LiteLLM did not pass its authenticated startup check. Restore its saved private credentials before retrying.");
        report(phase, DESKTOP_STARTUP_STATUS.complete, "LiteLLM is ready with its private database and verified master key.");

        // 4. Application Database: Run main application PostgreSQL service and wait for it to be healthy.
        // This is on the application's critical path, so it is started before the optional embedding service.
        phase = DESKTOP_STARTUP_STEP_IDS.applicationDatabase;
        report(phase, DESKTOP_STARTUP_STATUS.running, "Starting the application PostgreSQL database...");
        await startService(
            DOCKER_SERVICE_NAMES.applicationDatabase,
            "The managed application database container could not start. Check Docker Desktop memory, disk space, and this application's Docker project, then retry."
        );
        report(phase, DESKTOP_STARTUP_STATUS.running, "Waiting for the application PostgreSQL database to become healthy...");
        const applicationDatabaseId = await ready(DOCKER_SERVICE_NAMES.applicationDatabase);
        const applicationDatabasePort = new URL(await publishedUrl(applicationDatabaseId, SERVICE_PORTS.postgresql)).port;
        const applicationDatabaseAddress = new URL(`${DOCKER_PROTOCOLS.postgresql}//${LOOPBACK_HOST}:${applicationDatabasePort}`);
        applicationDatabaseAddress.username = credentials.appPostgresUsername;
        applicationDatabaseAddress.password = credentials.appPostgresPassword;
        applicationDatabaseAddress.pathname = `/${credentials.appPostgresDatabase}`;

        // 5. Ollama Embeddings: Start the managed Ollama service and ensure the embedding model is present.
        // Embeddings power retrieval-augmented discussions but are not required for the application to start,
        // so a slow or unreachable model pull must never wedge startup: the container is health-gated, and the
        // model pull runs in the background with its outcome logged. RAG degrades gracefully until it finishes.
        phase = DESKTOP_STARTUP_STEP_IDS.ollama;
        report(phase, DESKTOP_STARTUP_STATUS.running, "Starting the Ollama embedding service...");
        await startService(
            DOCKER_SERVICE_NAMES.ollama,
            "The managed Ollama container could not start. Check container runtime memory, disk space, and this application's project, then retry."
        );
        report(phase, DESKTOP_STARTUP_STATUS.running, "Waiting for the Ollama embedding service to become healthy...");
        const ollamaId = await ready(DOCKER_SERVICE_NAMES.ollama);
        const ollamaUrl = await publishedUrl(ollamaId, SERVICE_PORTS.ollama);
        void ensureEmbeddingModel(executable, ollamaId, env, options.signal);
        report(phase, DESKTOP_STARTUP_STATUS.complete, `Ollama is ready; the ${OLLAMA_EMBEDDING_MODEL} embedding model is being prepared in the background.`);

        return { stackName, litellmUrl, litellmMasterKey: credentials.litellmMasterKey, milvusUrl, milvusToken, ollamaUrl,
            applicationDatabaseUrl: applicationDatabaseAddress.toString() };
    } catch (error) {
        const safe = error instanceof DesktopInfrastructureError ? error : new DesktopInfrastructureError(options.signal.aborted
            ? "Desktop infrastructure startup was cancelled."
            : "Desktop infrastructure could not initialize safely. Check your container runtime and the application's private runtime directory, then retry.");
        report(phase, DESKTOP_STARTUP_STATUS.error, safe.message);
        throw safe;
    }
}
