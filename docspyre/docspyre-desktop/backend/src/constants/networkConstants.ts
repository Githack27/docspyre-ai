export const LOOPBACK_HOST = "127.0.0.1";
export const LOCALHOST_HOST = "localhost";
export const MAXIMUM_TCP_PORT = 65535;
export const POSTGRESQL_PROTOCOLS = ["postgres:", "postgresql:"] as const;

export const PRIVATE_PORT_RANGE = {
    minimum: 50_000,
    maximum: 59_999,
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

