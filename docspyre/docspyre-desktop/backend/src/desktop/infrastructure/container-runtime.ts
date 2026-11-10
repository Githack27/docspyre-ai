import {
    CONTAINER_RUNTIMES,
    CONTAINER_RUNTIME_DETECTION_ORDER,
    CONTAINER_RUNTIME_ENVIRONMENT_KEY,
    CONTAINER_RUNTIME_IDS,
    CONTAINER_RUNTIME_PROBE_ARGUMENTS,
    type ContainerRuntimeDefinition,
    type ContainerRuntimeId,
} from "../../constants/containerRuntimeConstants.js";
import { DOCKER_TIMEOUTS_MS } from "../../constants/dockerConstants.js";
import { DesktopInfrastructureError } from "./infrastructure-error.js";
import { runInfrastructureProcess } from "./infrastructure-process.js";

function supportedRuntimeList(): string {
    return CONTAINER_RUNTIME_DETECTION_ORDER.map(id => CONTAINER_RUNTIMES[id].executable).join(", ");
}

function configuredRuntime(): ContainerRuntimeId | null {
    const requested = process.env[CONTAINER_RUNTIME_ENVIRONMENT_KEY];
    if (requested === undefined || requested.trim() === "") return null;
    const normalized = requested.trim().toLowerCase();
    const match = (Object.values(CONTAINER_RUNTIME_IDS) as string[]).includes(normalized) ? normalized as ContainerRuntimeId : null;
    if (match === null) {
        throw new DesktopInfrastructureError(`The ${CONTAINER_RUNTIME_ENVIRONMENT_KEY} setting must name a supported container runtime (${Object.values(CONTAINER_RUNTIME_IDS).join(", ")}).`);
    }
    return match;
}

async function runtimeResponds(definition: ContainerRuntimeDefinition, signal: AbortSignal): Promise<boolean> {
    try {
        await runInfrastructureProcess(definition.executable, [...CONTAINER_RUNTIME_PROBE_ARGUMENTS], {
            signal, timeoutMs: DOCKER_TIMEOUTS_MS.cli,
            failureMessage: `The ${definition.executable} container runtime did not respond to a compose probe.`,
        });
        return true;
    } catch {
        return false;
    }
}

/** Probes each supported runtime in detection order and returns the first whose compose plugin responds. */
export async function resolveContainerRuntime(signal: AbortSignal): Promise<ContainerRuntimeDefinition> {
    if (signal.aborted) throw new DesktopInfrastructureError("Desktop infrastructure startup was cancelled.");
    const forced = configuredRuntime();
    if (forced !== null) {
        const definition = CONTAINER_RUNTIMES[forced];
        if (!await runtimeResponds(definition, signal)) {
            throw new DesktopInfrastructureError(`The requested ${definition.executable} container runtime is not available. Install it and enable its compose plugin, then restart the application.`);
        }
        return definition;
    }
    for (const id of CONTAINER_RUNTIME_DETECTION_ORDER) {
        const definition = CONTAINER_RUNTIMES[id];
        if (await runtimeResponds(definition, signal)) return definition;
    }
    throw new DesktopInfrastructureError(`No supported container runtime with a compose plugin was found. Install and start one of: ${supportedRuntimeList()}.`);
}
