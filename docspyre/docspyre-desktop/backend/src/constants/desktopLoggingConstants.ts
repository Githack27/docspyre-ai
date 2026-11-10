export const DESKTOP_LOGGING = {
    directoryEnvironmentKey: "DETQEL_LOG_DIR",
    backendDirectory: "backend",
    backendFile: "backend.log",
    backendBackupFile: "backend.log.1",
    source: "backend",
    maximumFileBytes: 20 * 1024 * 1024,
    maximumEntryBytes: 64 * 1024,
    maximumTextCharacters: 16 * 1024,
    maximumEventCharacters: 100,
    maximumObjectFields: 32,
    maximumDepth: 4,
    maximumPendingWrites: 128,
    writeWaitMilliseconds: 1_000,
    directoryMode: 0o700,
    fileMode: 0o600,
    redacted: "[REDACTED]",
    truncated: "[TRUNCATED]",
    circular: "[CIRCULAR]",
} as const;

export const DESKTOP_LOG_EVENTS = {
    processStarted: "infrastructure.process.started",
    processFinished: "infrastructure.process.finished",
} as const;

export const DESKTOP_PROCESS_OUTCOMES = {
    succeeded: "succeeded",
    failed: "failed",
    cancelled: "cancelled",
    timedOut: "timed-out",
    spawnFailed: "spawn-failed",
} as const;

export const DESKTOP_PROCESS_OPERATION = {
    unknown: "system.command",
    docker: "docker.command",
    compose: "docker.compose",
    composeArgument: "compose",
    dockerCommands: new Set(["info", "version", "inspect", "ps", "pull", "stop", "rm", "exec", "volume", "network", "context", "desktop"]),
    dockerSubcommands: new Set(["ls", "inspect", "create", "show", "start", "version"]),
    composeCommands: new Set(["version", "pull", "up", "ps"]),
    dockerExecutable: /^(?:docker|podman|nerdctl)(?:\.exe)?$/i,
} as const;

export const DESKTOP_LOG_REDACTION = {
    privateKey: /PASSWORD|SECRET|TOKEN|API[_-]?KEY|MASTER[_-]?KEY|SALT|DATABASE[_-]?URL|AUTHORIZATION|CREDENTIAL|PRIVATE[_-]?KEY/i,
    privateKeyBlock: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
    uriUserInfo: /([a-z][a-z0-9+.-]*:\/\/)[^\s/@]+@/gi,
    authorization: /\b(Bearer|Basic)\s+[A-Za-z0-9+/_=.:~-]+/gi,
    queryValue: /([?&](?:access_token|refresh_token|id_token|token|password|secret|api[_-]?key|signature|credential|sig|x-amz-signature|x-amz-credential)=)[^&\s"'<>]+/gi,
    quotedValue: /(["']?(?:password|passwd|secret|(?:access_|refresh_|id_)?token|api[_-]?key|master[_-]?key|salt|database[_-]?url|authorization|credential|identitytoken|registrytoken)["']?\s*[:=]\s*)(["'])(.*?)\2/gi,
    unquotedValue: /((?:password|passwd|secret|(?:access_|refresh_|id_)?token|api[_-]?key|master[_-]?key|salt|database[_-]?url|authorization|credential|identitytoken|registrytoken)\s*[:=]\s*)(?!["'])[^\s,;}&]+/gi,
    terminalControl: /\x1b\[[0-?]*[ -/]*[@-~]|[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g,
} as const;

export const DESKTOP_REGISTRY_FAILURE_RULES = [
    { pattern: /toomanyrequests|too many requests|pull rate limit|429\s+(?:too many|rate)/i, message: "The container registry rejected the image download because its request limit was reached. Sign in to the affected registry in Docker Desktop or wait for the limit to reset, then retry." },
    { pattern: /x509:|certificate signed by unknown authority|certificate has expired|tls: failed to verify certificate/i, message: "Docker could not verify the container registry's TLS certificate. Check Docker Desktop's trusted certificates and network proxy configuration, then retry." },
    { pattern: /no such host|temporary failure in name resolution|server misbehaving|failed to resolve[^\r\n]*(?:lookup|host)|lookup[^\r\n]*(?:i\/o timeout|no such host)/i, message: "Docker could not resolve the container registry's hostname. Check Docker Desktop DNS and network access, then retry." },
    { pattern: /manifest unknown|manifest for[^\r\n]*not found|no matching manifest|failed to resolve reference[^\r\n]*not found|unexpected status[^\r\n]*404|fetch failed after status: 404/i, message: "A required container image or platform manifest is unavailable from its registry. Check the image reference and supported Docker platform before retrying." },
    { pattern: /pull access denied|unauthorized:|authentication required|denied: requested access|unexpected status[^\r\n]*(?:401|403)/i, message: "The container registry denied access to a required image. Check the registry's availability and Docker Desktop authentication, then retry." },
    { pattern: /tls handshake timeout|i\/o timeout|context deadline exceeded|client\.timeout exceeded|connection timed out|proxyconnect tcp|connection refused|network is unreachable/i, message: "Docker could not reach the container registry before its network request failed. Check Docker Desktop's network, proxy, and registry access, then retry." },
] as const;
