import { randomInt, randomUUID } from "node:crypto";
import { readFile, rename, unlink, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { isAbsolute, join } from "node:path";
import {
    DESKTOP_FILESYSTEM_ERROR_CODES,
    DESKTOP_RETRYABLE_PORT_ERRORS,
} from "../../constants/desktopConstants.js";
import {
    DOCKER_ASSET_FILES,
    DOCKER_FILE_MODES,
    DOCKER_LIMITS,
    DOCKER_PORT_FILE_VERSION,
    DOCKER_PORT_KEYS,
    DOCKER_TIMEOUTS_MS,
} from "../../constants/dockerConstants.js";
import {
    DEFAULT_SERVICE_HOST_PORTS,
    LOOPBACK_HOST,
    PRIVATE_PORT_RANGE,
} from "../../constants/networkConstants.js";
import { DesktopInfrastructureError } from "./infrastructure-error.js";

export interface InfrastructurePorts {
    litellm: number;
    milvus: number;
    ollama: number;
    applicationDatabase: number;
}

export interface InfrastructurePortsOptions {
    directory: string;
    signal: AbortSignal;
    /** Published ports from containers whose runtime ownership the caller has verified. */
    existingPorts?: Partial<InfrastructurePorts>;
}

function assertActive(signal: AbortSignal): void {
    if (signal.aborted) throw new DesktopInfrastructureError("Private service port allocation was cancelled.");
}

function validPort(value: unknown): value is number {
    return typeof value === "number" && Number.isInteger(value) && value >= PRIVATE_PORT_RANGE.minimum && value <= PRIVATE_PORT_RANGE.maximum;
}

async function readSavedPorts(directory: string): Promise<Partial<InfrastructurePorts> | null> {
    let data: string;
    try { data = await readFile(join(directory, DOCKER_ASSET_FILES.ports), "utf8"); }
    catch (error) {
        if ((error as NodeJS.ErrnoException).code === DESKTOP_FILESYSTEM_ERROR_CODES.notFound) return null;
        throw error;
    }
    let value: unknown;
    try { value = JSON.parse(data); }
    catch { throw new DesktopInfrastructureError(`Saved private service port assignments are damaged. Restore ${DOCKER_ASSET_FILES.ports} in the private infrastructure directory before restarting.`); }
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new DesktopInfrastructureError("Saved private service port assignments are invalid.");
    }
    const saved = value as Record<string, unknown>;
    // A file saved before a service existed lacks that service's port; absent ports are allocated and saved
    // by the caller. If the port configuration changed or ports are invalid, reset and reallocate.
    const present = DOCKER_PORT_KEYS.map(key => saved[key]).filter(port => port !== undefined);
    if (saved.version !== DOCKER_PORT_FILE_VERSION || present.some(port => !validPort(port)) || new Set(present).size !== present.length) {
        return null;
    }
    const ports: Partial<InfrastructurePorts> = {};
    for (const key of DOCKER_PORT_KEYS) if (saved[key] !== undefined) ports[key] = saved[key] as number;
    return ports;
}

function portIsAvailable(port: number, signal: AbortSignal): Promise<boolean> {
    assertActive(signal);
    return new Promise((resolve, reject) => {
        const server = createServer(socket => socket.destroy());
        server.unref();
        let finished = false;
        const finish = (available: boolean, error?: DesktopInfrastructureError) => {
            if (finished) return;
            finished = true;
            clearTimeout(timer);
            signal.removeEventListener("abort", abort);
            server.close(() => {
                if (error) reject(error);
                else resolve(available);
            });
        };
        const abort = () => finish(false, new DesktopInfrastructureError("Private service port allocation was cancelled."));
        const timer = setTimeout(() => finish(false, new DesktopInfrastructureError("A private service port could not be checked within its allocation time limit.")), DOCKER_TIMEOUTS_MS.portAvailability);
        signal.addEventListener("abort", abort, { once: true });
        server.once("error", (error: NodeJS.ErrnoException) => {
            if (error.code !== undefined && DESKTOP_RETRYABLE_PORT_ERRORS.includes(error.code)) finish(false);
            else finish(false, new DesktopInfrastructureError("A private loopback service port could not be inspected safely."));
        });
        server.once("listening", () => {
            if (finished) server.close();
            else finish(true);
        });
        if (signal.aborted) { abort(); return; }
        server.listen({ host: LOOPBACK_HOST, port, exclusive: true });
    });
}

async function allocatePort(selected: Set<number>, signal: AbortSignal): Promise<number> {
    for (let attempt = 0; attempt < DOCKER_LIMITS.portAllocationAttempts; attempt++) {
        assertActive(signal);
        const port = randomInt(PRIVATE_PORT_RANGE.minimum, PRIVATE_PORT_RANGE.maximum + 1);
        if (!selected.has(port) && await portIsAvailable(port, signal)) return port;
    }
    throw new DesktopInfrastructureError("Distinct private loopback service ports could not be allocated. Close conflicting applications and restart.");
}

async function savePorts(directory: string, ports: InfrastructurePorts): Promise<void> {
    const temporary = join(directory, `${DOCKER_ASSET_FILES.portsTemporaryPrefix}${randomUUID()}${DOCKER_ASSET_FILES.temporarySuffix}`);
    try {
        await writeFile(temporary, `${JSON.stringify({ version: DOCKER_PORT_FILE_VERSION, ...ports }, null, 2)}\n`, { flag: "wx", mode: DOCKER_FILE_MODES.privateFile });
        await rename(temporary, join(directory, DOCKER_ASSET_FILES.ports));
    } finally {
        await unlink(temporary).catch(error => {
            if ((error as NodeJS.ErrnoException).code !== DESKTOP_FILESYSTEM_ERROR_CODES.notFound) throw error;
        });
    }
}

/** Probing detects current conflicts; Docker must still fail safely if another process claims a port afterward. */
export async function prepareInfrastructurePorts(options: InfrastructurePortsOptions): Promise<InfrastructurePorts> {
    if (!isAbsolute(options.directory)) throw new DesktopInfrastructureError("Private service port storage requires an absolute infrastructure directory.");
    assertActive(options.signal);
    try {
        const saved = await readSavedPorts(options.directory);
        const selected = new Set<number>();
        const ports = {} as InfrastructurePorts;
        for (const key of DOCKER_PORT_KEYS) {
            const existing = options.existingPorts?.[key];
            if (existing !== undefined) {
                if (!validPort(existing) || selected.has(existing)) {
                    throw new DesktopInfrastructureError("An owned service published an invalid or duplicate private loopback port. Startup stopped without exposing a public port.");
                }
                ports[key] = existing;
                selected.add(existing);
            }
        }
        for (const key of DOCKER_PORT_KEYS) {
            if (ports[key] !== undefined) continue;
            assertActive(options.signal);
            const savedPort = saved !== null ? saved[key] : undefined;
            const preferredPort = DEFAULT_SERVICE_HOST_PORTS[key];
            if (savedPort !== undefined && validPort(savedPort) && !selected.has(savedPort) && await portIsAvailable(savedPort, options.signal)) {
                ports[key] = savedPort;
            } else if (preferredPort !== undefined && validPort(preferredPort) && !selected.has(preferredPort) && await portIsAvailable(preferredPort, options.signal)) {
                ports[key] = preferredPort;
            } else {
                ports[key] = await allocatePort(selected, options.signal);
            }
            selected.add(ports[key]);
        }
        assertActive(options.signal);
        await savePorts(options.directory, ports);
        assertActive(options.signal);
        return ports;
    } catch (error) {
        if (error instanceof DesktopInfrastructureError) throw error;
        throw new DesktopInfrastructureError("Private service port assignments could not be read or saved. Check access to the application's private infrastructure directory.");
    }
}
