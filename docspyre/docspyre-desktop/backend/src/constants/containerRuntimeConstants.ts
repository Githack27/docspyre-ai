import { DOCKER_EXECUTABLE } from "./dockerConstants.js";

export const CONTAINER_RUNTIME_IDS = {
    docker: "docker",
    podman: "podman",
    rancher: "rancher",
} as const;
export type ContainerRuntimeId = typeof CONTAINER_RUNTIME_IDS[keyof typeof CONTAINER_RUNTIME_IDS];

export interface ContainerRuntimeDefinition {
    id: ContainerRuntimeId;
    executable: string;
    composeInvocation: readonly string[];
    /** Only the docker runtime has a desktop engine this application can auto-launch. */
    autoLaunch: boolean;
}

/** Rancher Desktop ships the nerdctl CLI; podman provides a docker-compatible compose subcommand. */
export const CONTAINER_RUNTIMES: Readonly<Record<ContainerRuntimeId, ContainerRuntimeDefinition>> = {
    [CONTAINER_RUNTIME_IDS.docker]: { id: CONTAINER_RUNTIME_IDS.docker, executable: DOCKER_EXECUTABLE, composeInvocation: ["compose"], autoLaunch: true },
    [CONTAINER_RUNTIME_IDS.podman]: { id: CONTAINER_RUNTIME_IDS.podman, executable: "podman", composeInvocation: ["compose"], autoLaunch: false },
    [CONTAINER_RUNTIME_IDS.rancher]: { id: CONTAINER_RUNTIME_IDS.rancher, executable: "nerdctl", composeInvocation: ["compose"], autoLaunch: false },
} as const;

export const CONTAINER_RUNTIME_DETECTION_ORDER: readonly ContainerRuntimeId[] = [
    CONTAINER_RUNTIME_IDS.docker,
    CONTAINER_RUNTIME_IDS.podman,
    CONTAINER_RUNTIME_IDS.rancher,
] as const;

export const CONTAINER_RUNTIME_ENVIRONMENT_KEY = "CONTAINER_RUNTIME";

export const CONTAINER_RUNTIME_PROBE_ARGUMENTS = ["compose", "version", "--short"] as const;
