import { APPLICATION_NAME, APPLICATION_NAMESPACE } from "./commonConstants.js";
import { POSTGRESQL_PROTOCOLS, SERVICE_PORTS } from "./networkConstants.js";
import { DESKTOP_STARTUP_STEP_IDS } from "./desktopConstants.js";

export const DOCKER_PROJECT_NAME = `${APPLICATION_NAMESPACE}-stack`;
export const DOCKER_PREVIOUS_PROJECT_NAMES = [APPLICATION_NAMESPACE] as const;
export const DOCKER_PREVIOUS_SERVICE_NAMES = {
    litellm: "litellm", litellmDatabase: "litellm-db", milvus: "milvus", applicationDatabase: "app-db",
} as const;
export const DOCKER_PREVIOUS_CONTAINER_NAMES: ReadonlySet<string> = new Set(Object.values(DOCKER_PREVIOUS_SERVICE_NAMES));
export const DOCKER_EXECUTABLE = "docker";
export const DOCKER_RUNTIME_PLATFORM = "linux";
export const DOCKER_LOCAL_ENDPOINT_PROTOCOLS = ["npipe://", "unix://"] as const;
export const DOCKER_MINIMUM_COMPOSE_MAJOR_VERSION = 2;

export const DOCKER_SERVICE_NAMES = {
    litellm: `${APPLICATION_NAMESPACE}-litellm`,
    litellmDatabase: `${APPLICATION_NAMESPACE}-litellm-db`,
    milvus: `${APPLICATION_NAMESPACE}-milvus`,
    ollama: `${APPLICATION_NAMESPACE}-ollama`,
    applicationDatabase: `${APPLICATION_NAMESPACE}-app-db`,
} as const;

export const DOCKER_IMAGES = {
    litellm: "ghcr.io/berriai/litellm:latest",
    postgresql: "postgres:16",
    milvus: "milvusdb/milvus:v2.5.5",
    ollama: "ollama/ollama:latest",
} as const;

export const DOCKER_IMAGE_PULLS = [
    { image: DOCKER_IMAGES.postgresql, service: DOCKER_SERVICE_NAMES.litellmDatabase, step: DESKTOP_STARTUP_STEP_IDS.litellmDatabase },
    { image: DOCKER_IMAGES.milvus, service: DOCKER_SERVICE_NAMES.milvus, step: DESKTOP_STARTUP_STEP_IDS.milvus },
    { image: DOCKER_IMAGES.litellm, service: DOCKER_SERVICE_NAMES.litellm, step: DESKTOP_STARTUP_STEP_IDS.litellm },
    { image: DOCKER_IMAGES.ollama, service: DOCKER_SERVICE_NAMES.ollama, step: DESKTOP_STARTUP_STEP_IDS.ollama },
] as const;

export const DOCKER_VOLUME_NAMES = {
    litellmDatabase: `${APPLICATION_NAMESPACE}-litellm-db-data`,
    milvus: `${APPLICATION_NAMESPACE}-milvus-embedded-data`,
    ollama: `${APPLICATION_NAMESPACE}-ollama-data`,
    applicationDatabase: `${APPLICATION_NAMESPACE}-app-db-data`,
} as const;

export const OLLAMA_EMBEDDING_MODEL = "nomic-embed-text";
export const OLLAMA_GATEWAY_BASE_URL = `http://${DOCKER_SERVICE_NAMES.ollama}:${SERVICE_PORTS.ollama}`;

export const DOCKER_NETWORK_NAMES = {
    litellmPrivate: `${APPLICATION_NAMESPACE}-litellm-private`,
    gateway: `${APPLICATION_NAMESPACE}-gateway`,
} as const;

export const DOCKER_LABELS = {
    runtime: `ai.${APPLICATION_NAMESPACE}.desktop.runtime`,
    project: "com.docker.compose.project",
    workingDirectory: "com.docker.compose.project.working_dir",
    service: "com.docker.compose.service",
    volume: "com.docker.compose.volume",
} as const;

export const DOCKER_CONTAINER_PATHS = {
    postgresqlData: "/var/lib/postgresql/data",
    milvusData: "/var/lib/milvus",
    ollamaData: "/root/.ollama",
} as const;

export const DOCKER_ASSET_FILES = {
    directory: "infrastructure",
    compose: "compose.yaml",
    environment: ".env",
    credentials: "credentials.json",
    ports: "ports.json",
    litellmConfiguration: "litellm.yaml",
    milvusTemplate: "milvus.user.yaml.template",
    milvusConfiguration: "milvus.user.yaml",
    embeddedEtcd: "milvus.embed-etcd.yaml",
    credentialsTemporaryPrefix: ".credentials-",
    portsTemporaryPrefix: ".ports-",
    temporarySuffix: ".tmp",
} as const;

export const DOCKER_ENVIRONMENT_KEYS = {
    host: "DOCKER_HOST",
    litellmImage: "LITELLM_IMAGE",
    postgresqlImage: "POSTGRESQL_IMAGE",
    milvusImage: "MILVUS_IMAGE",
    ollamaImage: "OLLAMA_IMAGE",
    litellmMasterKey: "LITELLM_MASTER_KEY",
    litellmSaltKey: "LITELLM_SALT_KEY",
    postgresUsername: "POSTGRES_USER",
    postgresPassword: "POSTGRES_PASSWORD",
    applicationPostgresUsername: "APP_POSTGRES_USER",
    applicationPostgresPassword: "APP_POSTGRES_PASSWORD",
    applicationPostgresDatabase: "APP_POSTGRES_DB",
    litellmDatabaseVolume: "LITELLM_DATABASE_VOLUME",
    litellmPort: "LITELLM_PORT",
    milvusPort: "MILVUS_PORT",
    ollamaPort: "OLLAMA_PORT",
    applicationDatabasePort: "APP_DATABASE_PORT",
    runtimeId: "DOCSPYRE_RUNTIME_ID",
    composeAnsi: "COMPOSE_ANSI",
    composeProgress: "COMPOSE_PROGRESS",
} as const;

export const DOCKER_COMPOSE_OUTPUT = { ansi: "never", progress: "plain" } as const;
export const DOCKER_PORT_KEYS = ["litellm", "milvus", "ollama", "applicationDatabase"] as const;
export type InfrastructurePortKey = typeof DOCKER_PORT_KEYS[number];
export const DOCKER_ENDPOINT_DEFINITIONS: Readonly<Record<string, { portKey: InfrastructurePortKey; containerPort: number }>> = {
    [DOCKER_SERVICE_NAMES.litellm]: { portKey: "litellm", containerPort: SERVICE_PORTS.litellm },
    [DOCKER_SERVICE_NAMES.milvus]: { portKey: "milvus", containerPort: SERVICE_PORTS.milvus },
    [DOCKER_SERVICE_NAMES.ollama]: { portKey: "ollama", containerPort: SERVICE_PORTS.ollama },
    [DOCKER_SERVICE_NAMES.applicationDatabase]: { portKey: "applicationDatabase", containerPort: SERVICE_PORTS.postgresql },
};

export const DOCKER_LEGACY = {
    projectPrefix: `${APPLICATION_NAMESPACE}-`,
    hashLength: 12,
    serviceNames: ["litellm", "litellm-database", "milvus", "milvus-volume-init", "etcd", "minio"],
    litellmDatabaseService: "litellm-database",
    litellmDatabaseVolume: "litellm-postgres",
} as const;

export const DOCKER_MANAGED_SERVICES: ReadonlySet<string> = new Set(Object.values(DOCKER_SERVICE_NAMES));
export const DOCKER_LEGACY_SERVICES: ReadonlySet<string> = new Set(DOCKER_LEGACY.serviceNames);

export const DOCKER_CONTAINER_STATUS = {
    running: "running", restarting: "restarting", paused: "paused", exited: "exited", dead: "dead", unhealthy: "unhealthy", healthy: "healthy",
} as const;
export const DOCKER_ACTIVE_CONTAINER_STATUSES: readonly string[] = [DOCKER_CONTAINER_STATUS.running, DOCKER_CONTAINER_STATUS.restarting, DOCKER_CONTAINER_STATUS.paused];

export const DOCKER_TIMEOUTS_MS = {
    cli: 20_000, ownershipCli: 30_000, desktopStart: 180_000, imagePull: 30 * 60_000,
    stackStart: 15 * 60_000, serviceReady: 10 * 60_000, http: 10_000,
    permissions: 15_000, pollInterval: 2_000, progressInterval: 5_000,
    legacyReplacement: 120_000, portAvailability: 2_500, modelPull: 30 * 60_000,
} as const;

export const DOCKER_LIMITS = {
    captureBytes: 512 * 1024, readinessResponseBytes: 1024 * 1024, portAllocationAttempts: 64,
    legacyStopSeconds: 30,
} as const;

export const DOCKER_FILE_MODES = { privateDirectory: 0o700, privateFile: 0o600, containerReadableFile: 0o644 } as const;

export const DOCKER_CREDENTIAL_SETTINGS = {
    version: 1, secretBytes: 32, usernameBytes: 10, temporaryNameBytes: 8,
    usernamePrefix: "docspyre_", litellmKeyPrefix: "sk-", applicationDatabase: APPLICATION_NAMESPACE.replaceAll("-", "_"),
    hashAlgorithm: "sha256", encoding: "hex", milvusRootUsername: "root",
    milvusRootPasswordPlaceholder: "__MILVUS_ROOT_PASSWORD__",
    requiredFields: ["litellmMasterKey", "litellmSaltKey", "postgresUsername", "postgresPassword", "milvusRootPassword"],
    applicationSecretFields: ["appPostgresUsername", "appPostgresPassword"],
    deprecatedSecretFields: ["minioAccessKey", "minioSecretKey"],
} as const;

export const DOCKER_PORT_FILE_VERSION = 1;

export const DOCKER_VALIDATION = {
    containerId: /^[a-f0-9]{12,64}$/,
    secret: /^[A-Za-z0-9_-]{20,72}$/,
    databaseIdentifier: /^[A-Za-z_][A-Za-z0-9_]{0,62}$/,
    databasePath: /^\/[A-Za-z0-9_]+$/,
    volumeName: /^[A-Za-z0-9][A-Za-z0-9_.-]{0,254}$/,
    legacyVolumeName: /^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/,
} as const;

export const DOCKER_PROTOCOLS = { http: "http:", postgresql: POSTGRESQL_PROTOCOLS[1], database: POSTGRESQL_PROTOCOLS } as const;
export const DOCKER_HEALTH_ENDPOINTS = { litellmReadiness: "/health/readiness", litellmModels: "/v1/models", milvusCollections: "/v2/vectordb/collections/list", ollamaTags: "/api/tags" } as const;
export const DOCKER_HEALTH_VALUES = { healthy: "healthy", databaseConnected: "connected", milvusSuccess: 0 } as const;

export const DOCKER_INSPECT_FORMATS = {
    names: "{{.Name}}", ids: "{{.ID}}", imageId: "{{.Id}}", labels: "{{json .Labels}}", ports: "{{json .NetworkSettings.Ports}}",
    state: "{{.State.Status}}|{{if .State.Health}}{{.State.Health.Status}}{{end}}",
    contextHost: "{{json .Endpoints.docker.Host}}", operatingSystem: "{{.OSType}}",
    container: '{"name":{{json .Name}},"labels":{{json .Config.Labels}},"mounts":{{json .Mounts}},"ports":{{json .NetworkSettings.Ports}},"status":{{json .State.Status}}}',
    network: '{"labels":{{json .Labels}},"internal":{{json .Internal}}}',
} as const;

export const DOCKER_PROCESS_FAILURE_RULES = [
    { pattern: /invalid\s+(?:(?:container|host)\s*)?port\b|invalid\s+publish\s+(?:opts|options)/i, message: `A managed Docker port mapping is invalid. Correct the desktop runtime configuration, then restart ${APPLICATION_NAME}.` },
    { pattern: /port is already allocated|address already in use|only one usage of each socket address|ports are not available|failed to bind host port|bind[^\r\n]*failed[^\r\n]*port/i, message: `A managed Docker port is already in use. Close the conflicting process or container, then restart ${APPLICATION_NAME}.` },
    { pattern: /out of memory|cannot allocate memory|insufficient memory|not enough memory|oom[- ]?kill/i, message: `Docker does not have enough memory to start the workspace services. Free memory or increase Docker Desktop's memory allocation, then restart ${APPLICATION_NAME}.` },
    { pattern: /no space left on device|not enough space on (?:the )?disk|disk (?:is )?full|insufficient disk space/i, message: `Docker does not have enough disk space to start the workspace services. Free space on the Docker storage drive, then restart ${APPLICATION_NAME}.` },
    { pattern: /permission denied|access is denied|operation not permitted/i, message: `Docker could not access a required file or resource. Check Docker Desktop and filesystem permissions, then restart ${APPLICATION_NAME}.` },
] as const;

export const APPLICATION_DATABASE_STARTUP_SETTINGS = { poolMaximum: 1, idleTimeoutSeconds: 5, connectTimeoutSeconds: 10 } as const;
export const APPLICATION_DATABASE_PHASES = { connect: "connect", migrate: "migrate", seed: "seed", verify: "verify" } as const;
