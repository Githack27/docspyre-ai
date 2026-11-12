export const DESKTOP_STARTUP_STATUS = { pending: "pending", running: "running", complete: "complete", error: "error" } as const;
export type DesktopStartupStatus = typeof DESKTOP_STARTUP_STATUS[keyof typeof DESKTOP_STARTUP_STATUS];
export type DesktopReportedStartupStatus = Exclude<DesktopStartupStatus, typeof DESKTOP_STARTUP_STATUS.pending>;
export const DESKTOP_STARTUP_STEP_IDS = {
    frontend: "frontend-startup", backendRuntime: "backend-startup",
    docker: "docker", litellmDatabase: "litellm-database", milvus: "milvus", litellm: "litellm",
    ollama: "ollama", applicationDatabase: "application-database", backendApi: "backend-api",
} as const;
export const DESKTOP_STARTUP_STEPS = [
    { id: DESKTOP_STARTUP_STEP_IDS.frontend, label: "Frontend startup" },
    { id: DESKTOP_STARTUP_STEP_IDS.backendRuntime, label: "Backend startup" },
    { id: DESKTOP_STARTUP_STEP_IDS.docker, label: "Container runtime" },
    { id: DESKTOP_STARTUP_STEP_IDS.litellmDatabase, label: "LiteLLM database" },
    { id: DESKTOP_STARTUP_STEP_IDS.milvus, label: "Milvus vector store" },
    { id: DESKTOP_STARTUP_STEP_IDS.litellm, label: "LiteLLM gateway" },
    { id: DESKTOP_STARTUP_STEP_IDS.applicationDatabase, label: "Application database" },
    { id: DESKTOP_STARTUP_STEP_IDS.ollama, label: "Ollama embeddings" },
    { id: DESKTOP_STARTUP_STEP_IDS.backendApi, label: "Backend API" },
] as const;
export const DESKTOP_INFRASTRUCTURE_LABELS = {
    [DESKTOP_STARTUP_STEP_IDS.docker]: "Container runtime",
    [DESKTOP_STARTUP_STEP_IDS.litellmDatabase]: "LiteLLM database",
    [DESKTOP_STARTUP_STEP_IDS.milvus]: "Milvus vector database",
    [DESKTOP_STARTUP_STEP_IDS.litellm]: "LiteLLM gateway",
    [DESKTOP_STARTUP_STEP_IDS.ollama]: "Ollama embeddings",
    [DESKTOP_STARTUP_STEP_IDS.applicationDatabase]: "Application database",
} as const;
export type DesktopInfrastructureStepId = keyof typeof DESKTOP_INFRASTRUCTURE_LABELS;
export const DESKTOP_STARTUP_SETTINGS = { initializationTimeoutMs: 10_000, apiPortAllocationAttempts: 100, initialApiPort: 0 } as const;
export const DESKTOP_IPC = { startupEventType: "startup", shutdownCommand: "shutdown", shutdownSignals: ["SIGINT", "SIGTERM"] } as const;
export const DESKTOP_PLATFORM = { windows: "win32", production: "production", enabledMarker: "1" } as const;
export const DESKTOP_FILES = { infrastructureAssets: "../infrastructure/", backendEnvironment: "backend.env", windowsSystemDirectory: "System32", whoamiExecutable: "whoami.exe", permissionsExecutable: "icacls.exe" } as const;
export const DESKTOP_ENVIRONMENT_KEYS = {
    configurationPath: "DOCSPYRE_CONFIG_PATH", runtimeDirectory: "DOCSPYRE_RUNTIME_DIR", enabled: "DOCSPYRE_DESKTOP",
    host: "HOST", port: "PORT", nodeEnvironment: "NODE_ENV", nodeOptions: "NODE_OPTIONS", nodePath: "NODE_PATH",
    windowsSystemRoot: "SystemRoot", litellmBaseUrl: "LITELLM_BASE_URL", litellmApiKey: "LITELLM_API_KEY",
    milvusAddress: "MILVUS_ADDRESS", milvusToken: "MILVUS_TOKEN", databaseUrl: "DATABASE_URL",
    ollamaBaseUrl: "OLLAMA_BASE_URL", ollamaEmbeddingModel: "OLLAMA_EMBEDDING_MODEL",
} as const;
export const DESKTOP_PROTECTED_ENVIRONMENT_KEYS: readonly string[] = [
    DESKTOP_ENVIRONMENT_KEYS.host, DESKTOP_ENVIRONMENT_KEYS.port, DESKTOP_ENVIRONMENT_KEYS.nodeEnvironment,
    DESKTOP_ENVIRONMENT_KEYS.nodeOptions, DESKTOP_ENVIRONMENT_KEYS.nodePath, DESKTOP_ENVIRONMENT_KEYS.runtimeDirectory,
];
/** Must match `identifier` in src-tauri/tauri.conf.json; Tauri keeps the private runtime under its app config directory. */
export const DESKTOP_APP_IDENTIFIER = "ai.docspyre.desktop";
export const DESKTOP_RUNTIME_DIRECTORY_NAME = "runtime";
export const DESKTOP_VALIDATION = { startupToken: /^[a-f0-9-]{36}$/, windowsUserSid: /\bS-\d-(?:\d+-)*\d+\b/ } as const;
export const DESKTOP_RETRYABLE_PORT_ERRORS: readonly string[] = ["EADDRINUSE", "EACCES"];
export const DESKTOP_FILESYSTEM_ERROR_CODES = { notFound: "ENOENT", alreadyExists: "EEXIST" } as const;

