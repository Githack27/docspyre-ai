export const LOOPBACK_HOST = "127.0.0.1";
export const LOCALHOST_HOST = "localhost";
export const MAXIMUM_TCP_PORT = 65535;
export const POSTGRESQL_PROTOCOLS = ["postgres:", "postgresql:"] as const;

export const PRIVATE_PORT_RANGE = {
    minimum: 57_000,
    maximum: 57_999,
} as const;

export const DEFAULT_SERVICE_HOST_PORTS = {
    api: 57_000,
    applicationDatabase: 57_001,
    milvus: 57_003,
    litellm: 57_004,
    ollama: 57_005,
} as const;

export const SERVICE_PORTS = {
    frontend: 4200,
    api: 8000,
    postgresql: 5432,
    ollama: 11434,
    litellm: 4000,
    milvus: 19530,
} as const;

export const FRONTEND_ORIGINS = [
    `http://${LOOPBACK_HOST}:${SERVICE_PORTS.frontend}`,
    `http://${LOCALHOST_HOST}:${SERVICE_PORTS.frontend}`,
] as const;

