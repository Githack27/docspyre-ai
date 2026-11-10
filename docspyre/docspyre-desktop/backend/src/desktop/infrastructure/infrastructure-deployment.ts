import { resolve } from "node:path";
import { APPLICATION_NAMESPACE } from "../../constants/commonConstants.js";
import { DESKTOP_PLATFORM } from "../../constants/desktopConstants.js";
import {
    DOCKER_CONTAINER_PATHS,
    DOCKER_ENDPOINT_DEFINITIONS,
    DOCKER_INSPECT_FORMATS,
    DOCKER_LABELS,
    DOCKER_LEGACY,
    DOCKER_LEGACY_SERVICES,
    DOCKER_LIMITS,
    DOCKER_MANAGED_SERVICES,
    DOCKER_NETWORK_NAMES,
    DOCKER_PREVIOUS_PROJECT_NAMES,
    DOCKER_PREVIOUS_CONTAINER_NAMES,
    DOCKER_PREVIOUS_SERVICE_NAMES,
    DOCKER_PROJECT_NAME,
    DOCKER_SERVICE_NAMES,
    DOCKER_TIMEOUTS_MS,
    DOCKER_VALIDATION,
    DOCKER_VOLUME_NAMES,
} from "../../constants/dockerConstants.js";
import { LOOPBACK_HOST } from "../../constants/networkConstants.js";
import { infrastructureRuntimeId, legacyInfrastructureStackName } from "./infrastructure-configuration.js";
import type { InfrastructurePorts } from "./infrastructure-ports.js";
import { DesktopInfrastructureError } from "./infrastructure-error.js";
import { runInfrastructureProcess } from "./infrastructure-process.js";

interface ContainerDescription {
    name: string;
    labels: Record<string, string>;
    mounts: { Type: string; Name?: string; Destination: string }[];
    ports: Record<string, { HostIp: string; HostPort: string }[] | null>;
    status: string;
}

export interface InfrastructureDeployment {
    litellmDatabaseVolume: string;
    /**
     * Containers from a previous project name or the legacy stack. Their names or ownership no longer match the
     * current compose project, so they are replaced. This installation's current containers are never listed here;
     * compose starts them as they are and recreates one only when its configuration has changed.
     */
    replacedContainerIds: string[];
    /** Host ports currently published by this installation's running containers, so they are kept as-is. */
    publishedPorts: Partial<InfrastructurePorts>;
}

/** Reads the loopback host port a running container publishes for its service port, if any. */
function publishedHostPort(container: ContainerDescription, containerPort: number): number | undefined {
    const binding = container.ports?.[`${containerPort}/tcp`]?.find(entry => entry.HostIp === LOOPBACK_HOST);
    const port = Number(binding?.HostPort);
    return Number.isInteger(port) && port > 0 ? port : undefined;
}

function canonicalPath(value: string): string {
    const absolute = resolve(value);
    return process.platform === DESKTOP_PLATFORM.windows ? absolute.toLowerCase() : absolute;
}

/** Inspect only ownership, mounts and ports; never capture container environment credentials. */
export async function prepareInfrastructureDeployment(options: {
    directory: string;
    runtimeDirectory: string;
    executable: string;
    signal: AbortSignal;
}): Promise<InfrastructureDeployment> {
    const docker = (args: string[]) => runInfrastructureProcess(options.executable, args, {
        signal: options.signal, timeoutMs: DOCKER_TIMEOUTS_MS.ownershipCli,
        failureMessage: "Managed container ownership could not be checked safely. Check your container runtime and retry.",
    });
    const runtimeId = infrastructureRuntimeId(options.directory);
    const legacyStack = legacyInfrastructureStackName(options.runtimeDirectory);
    const ids = async (filter: string): Promise<string[]> => {
        const output = await docker(["ps", "--all", "--filter", filter, "--format", DOCKER_INSPECT_FORMATS.ids]);
        const values = output.split(/\r?\n/).filter(Boolean);
        if (values.some(value => !DOCKER_VALIDATION.containerId.test(value))) throw new DesktopInfrastructureError("Managed Docker container identifiers are invalid.");
        return values;
    };
    const inspect = async (id: string): Promise<ContainerDescription> => {
        return JSON.parse(await docker(["inspect", "--format", DOCKER_INSPECT_FORMATS.container, id])) as ContainerDescription;
    };
    let litellmDatabaseVolume: string | undefined;
    const replacedContainerIds: string[] = [];
    const publishedPorts: Partial<InfrastructurePorts> = {};
    const ownContainers = new Set([
        ...await ids(`label=${DOCKER_LABELS.project}=${DOCKER_PROJECT_NAME}`),
        ...await ids(`name=^/${APPLICATION_NAMESPACE}-`),
        ...await ids(`label=${DOCKER_LABELS.project}=${DOCKER_PREVIOUS_PROJECT_NAMES[0]}`),
    ]);
    for (const id of ownContainers) {
        const container = await inspect(id);
        const name = container.name.replace(/^\//, "");
        const previousProject = (DOCKER_PREVIOUS_PROJECT_NAMES as readonly string[]).includes(container.labels?.[DOCKER_LABELS.project]);
        if ((!DOCKER_MANAGED_SERVICES.has(name) && !(previousProject && DOCKER_PREVIOUS_CONTAINER_NAMES.has(name)))
            || container.labels?.[DOCKER_LABELS.runtime] !== runtimeId
            || !([DOCKER_PROJECT_NAME, ...DOCKER_PREVIOUS_PROJECT_NAMES] as readonly string[]).includes(container.labels[DOCKER_LABELS.project])) {
            throw new DesktopInfrastructureError(`The ${DOCKER_PROJECT_NAME} Docker names are already owned by another installation. Stop that installation before starting this workspace.`);
        }
        if (previousProject) {
            replacedContainerIds.push(id);
        } else {
            // A current container is kept. If it is still running, keep its published port so the saved
            // configuration does not change and compose has no reason to recreate it.
            const endpoint = DOCKER_ENDPOINT_DEFINITIONS[name];
            const hostPort = endpoint ? publishedHostPort(container, endpoint.containerPort) : undefined;
            if (endpoint && hostPort !== undefined) publishedPorts[endpoint.portKey] = hostPort;
        }
        if (name === DOCKER_SERVICE_NAMES.litellmDatabase
            || (previousProject && name === DOCKER_PREVIOUS_SERVICE_NAMES.litellmDatabase)
            || container.labels[DOCKER_LABELS.service] === DOCKER_SERVICE_NAMES.litellmDatabase) {
            litellmDatabaseVolume = container.mounts.find(mount => mount.Type === "volume" && mount.Destination === DOCKER_CONTAINER_PATHS.postgresqlData)?.Name;
        }
    }
    for (const name of [DOCKER_VOLUME_NAMES.applicationDatabase, DOCKER_VOLUME_NAMES.milvus, DOCKER_VOLUME_NAMES.ollama]) {
        const names = (await docker(["volume", "ls", "--filter", `name=^${name}$`, "--format", DOCKER_INSPECT_FORMATS.names])).split(/\r?\n/).filter(Boolean);
        if (names.length === 0) {
            await docker(["volume", "create", "--label", `${DOCKER_LABELS.runtime}=${runtimeId}`, name]);
            continue;
        }
        const labels = JSON.parse(await docker(["volume", "inspect", "--format", DOCKER_INSPECT_FORMATS.labels, name])) as Record<string, string> | null;
        if (names.length !== 1 || labels?.[DOCKER_LABELS.runtime] !== runtimeId) {
            throw new DesktopInfrastructureError(`A ${DOCKER_PROJECT_NAME} data volume belongs to another installation. Existing data has been preserved.`);
        }
    }

    for (const name of Object.values(DOCKER_NETWORK_NAMES)) {
        const names = (await docker(["network", "ls", "--filter", `name=^${name}$`, "--format", DOCKER_INSPECT_FORMATS.names])).split(/\r?\n/).filter(Boolean);
        if (names.length === 0) {
            await docker(["network", "create", "--label", `${DOCKER_LABELS.runtime}=${runtimeId}`,
                ...(name === DOCKER_NETWORK_NAMES.litellmPrivate ? ["--internal"] : []), name]);
            continue;
        }
        const network = JSON.parse(await docker(["network", "inspect", "--format", DOCKER_INSPECT_FORMATS.network, name])) as { labels: Record<string, string> | null; internal: boolean };
        if (names.length !== 1 || network.labels?.[DOCKER_LABELS.runtime] !== runtimeId
            || (name === DOCKER_NETWORK_NAMES.litellmPrivate && !network.internal)) {
            throw new DesktopInfrastructureError("A managed Docker network has incompatible ownership or privacy settings. No existing data was removed.");
        }
    }

    const legacyContainerIds = await ids(`label=${DOCKER_LABELS.project}=${legacyStack}`);
    for (const id of legacyContainerIds) {
        const container = await inspect(id);
        const workingDirectory = container.labels?.[DOCKER_LABELS.workingDirectory];
        const service = container.labels?.[DOCKER_LABELS.service];
        if (!workingDirectory || canonicalPath(workingDirectory) !== canonicalPath(options.directory)
            || !DOCKER_LEGACY_SERVICES.has(service)) {
            throw new DesktopInfrastructureError("Legacy desktop containers could not be verified safely. No containers or data volumes were removed.");
        }
        if (service === DOCKER_LEGACY.litellmDatabaseService) {
            const previousVolume = container.mounts.find(mount => mount.Type === "volume" && mount.Destination === DOCKER_CONTAINER_PATHS.postgresqlData)?.Name;
            if (!previousVolume || (litellmDatabaseVolume && litellmDatabaseVolume !== previousVolume)) {
                throw new DesktopInfrastructureError("Conflicting LiteLLM database volumes require recovery before startup. Existing data has been preserved.");
            }
            litellmDatabaseVolume = previousVolume;
        }
    }
    // A prior failed deployment may have lost its containers while retaining the database volume.
    if (!litellmDatabaseVolume) {
        const legacyVolumes = (await docker(["volume", "ls", "--filter", `label=${DOCKER_LABELS.project}=${legacyStack}`,
            "--filter", `label=${DOCKER_LABELS.volume}=${DOCKER_LEGACY.litellmDatabaseVolume}`, "--format", DOCKER_INSPECT_FORMATS.names])).split(/\r?\n/).filter(Boolean);
        if (legacyVolumes.length > 1) throw new DesktopInfrastructureError("Multiple legacy LiteLLM database volumes were found. Existing data has been preserved for recovery.");
        litellmDatabaseVolume = legacyVolumes[0];
    }
    litellmDatabaseVolume ??= DOCKER_VOLUME_NAMES.litellmDatabase;
    if (!DOCKER_VALIDATION.legacyVolumeName.test(litellmDatabaseVolume)) throw new DesktopInfrastructureError("The managed database volume name is invalid.");
    const volumeNames = (await docker(["volume", "ls", "--filter", `name=^${litellmDatabaseVolume}$`, "--format", DOCKER_INSPECT_FORMATS.names])).split(/\r?\n/).filter(Boolean);
    if (volumeNames.length === 0 && litellmDatabaseVolume === DOCKER_VOLUME_NAMES.litellmDatabase) {
        await docker(["volume", "create", "--label", `${DOCKER_LABELS.runtime}=${runtimeId}`, DOCKER_VOLUME_NAMES.litellmDatabase]);
    } else {
        if (volumeNames.length !== 1 || volumeNames[0] !== litellmDatabaseVolume) throw new DesktopInfrastructureError("The saved LiteLLM database volume is missing. Restore it before restarting.");
        const labels = JSON.parse(await docker(["volume", "inspect", "--format", DOCKER_INSPECT_FORMATS.labels, litellmDatabaseVolume])) as Record<string, string> | null;
        if (labels?.[DOCKER_LABELS.runtime] !== runtimeId && labels?.[DOCKER_LABELS.project] !== legacyStack) {
            throw new DesktopInfrastructureError("The LiteLLM database volume belongs to another installation. Existing data has been preserved.");
        }
    }
    return { litellmDatabaseVolume, replacedContainerIds: [...new Set([...replacedContainerIds, ...legacyContainerIds])], publishedPorts };
}

/**
 * Removes only containers left by a previous project name or the legacy stack, so their names cannot clash
 * with the current compose project. Persistent volumes and networks survive, and current containers are untouched.
 */
export async function removeReplacedInfrastructureContainers(deployment: InfrastructureDeployment, executable: string, signal: AbortSignal): Promise<void> {
    if (!deployment.replacedContainerIds.length) return;
    await runInfrastructureProcess(executable, ["stop", "--time", String(DOCKER_LIMITS.legacyStopSeconds), ...deployment.replacedContainerIds], {
        signal, timeoutMs: DOCKER_TIMEOUTS_MS.legacyReplacement,
        failureMessage: "The previous desktop containers could not be stopped safely. Close the previous desktop instance and retry.",
    });
    await runInfrastructureProcess(executable, ["rm", ...deployment.replacedContainerIds], {
        signal, timeoutMs: DOCKER_TIMEOUTS_MS.legacyReplacement,
        failureMessage: "The previous desktop containers could not be replaced. Their data volumes have been preserved; close the previous desktop instance and retry.",
    });
}
