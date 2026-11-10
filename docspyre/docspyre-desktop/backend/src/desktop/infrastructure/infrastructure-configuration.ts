import { createHash, randomBytes } from "node:crypto";
import { constants } from "node:fs";
import { chmod, copyFile, mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";
import {
    DESKTOP_ENVIRONMENT_KEYS,
    DESKTOP_FILES,
    DESKTOP_FILESYSTEM_ERROR_CODES,
    DESKTOP_PLATFORM,
    DESKTOP_VALIDATION,
} from "../../constants/desktopConstants.js";
import {
    DOCKER_ASSET_FILES,
    DOCKER_COMPOSE_OUTPUT,
    DOCKER_CREDENTIAL_SETTINGS,
    DOCKER_ENVIRONMENT_KEYS,
    DOCKER_FILE_MODES,
    DOCKER_IMAGES,
    DOCKER_LABELS,
    DOCKER_LEGACY,
    DOCKER_PORT_KEYS,
    DOCKER_PROJECT_NAME,
    DOCKER_TIMEOUTS_MS,
    DOCKER_VALIDATION,
} from "../../constants/dockerConstants.js";
import { PRIVATE_PORT_RANGE } from "../../constants/networkConstants.js";
import { DesktopInfrastructureError } from "./infrastructure-error.js";
import { runInfrastructureProcess } from "./infrastructure-process.js";
import type { InfrastructurePorts } from "./infrastructure-ports.js";

export interface InfrastructureCredentials {
    version: typeof DOCKER_CREDENTIAL_SETTINGS.version;
    litellmMasterKey: string;
    litellmSaltKey: string;
    postgresUsername: string;
    postgresPassword: string;
    /** Retained when upgrading legacy credentials; no longer used by embedded Milvus. */
    minioAccessKey?: string;
    minioSecretKey?: string;
    milvusRootPassword: string;
    appPostgresUsername: string;
    appPostgresPassword: string;
    appPostgresDatabase: string;
}

export function infrastructureStackName(_runtimeDirectory: string): string { return DOCKER_PROJECT_NAME; }

export function infrastructureRuntimeId(directory: string): string {
    const absolute = resolve(directory);
    const canonical = process.platform === DESKTOP_PLATFORM.windows ? absolute.toLowerCase() : absolute;
    return createHash(DOCKER_CREDENTIAL_SETTINGS.hashAlgorithm).update(canonical).digest(DOCKER_CREDENTIAL_SETTINGS.encoding);
}

export function infrastructureDirectory(runtimeDirectory: string): string {
    return join(resolve(runtimeDirectory), DOCKER_ASSET_FILES.directory);
}

/** Docker filter matching only containers created for this installation's runtime directory. */
export function infrastructureOwnershipFilter(runtimeDirectory: string): string {
    return `label=${DOCKER_LABELS.runtime}=${infrastructureRuntimeId(infrastructureDirectory(runtimeDirectory))}`;
}

export function legacyInfrastructureStackName(runtimeDirectory: string): string {
    return `${DOCKER_LEGACY.projectPrefix}${infrastructureRuntimeId(runtimeDirectory).slice(0, DOCKER_LEGACY.hashLength)}`;
}

function applicationDatabaseCredentials() {
    return {
        appPostgresUsername: `${DOCKER_CREDENTIAL_SETTINGS.usernamePrefix}${randomBytes(DOCKER_CREDENTIAL_SETTINGS.usernameBytes).toString(DOCKER_CREDENTIAL_SETTINGS.encoding)}`,
        appPostgresPassword: randomBytes(DOCKER_CREDENTIAL_SETTINGS.secretBytes).toString(DOCKER_CREDENTIAL_SETTINGS.encoding),
        appPostgresDatabase: DOCKER_CREDENTIAL_SETTINGS.applicationDatabase,
    };
}

async function persistUpgradedCredentials(directory: string, credentials: InfrastructureCredentials): Promise<void> {
    const temporary = join(directory, `${DOCKER_ASSET_FILES.credentialsTemporaryPrefix}${randomBytes(DOCKER_CREDENTIAL_SETTINGS.temporaryNameBytes).toString(DOCKER_CREDENTIAL_SETTINGS.encoding)}${DOCKER_ASSET_FILES.temporarySuffix}`);
    try {
        await writeFile(temporary, `${JSON.stringify(credentials, null, 2)}\n`, { flag: "wx", mode: DOCKER_FILE_MODES.privateFile });
        await rename(temporary, join(directory, DOCKER_ASSET_FILES.credentials));
    } catch (error) {
        await unlink(temporary).catch(() => {});
        throw error;
    }
}

export async function preparePrivateInfrastructureDirectory(runtimeDirectory: string, signal: AbortSignal): Promise<string> {
    if (!isAbsolute(runtimeDirectory)) throw new DesktopInfrastructureError("Desktop infrastructure requires an absolute private runtime directory.");
    const directory = infrastructureDirectory(runtimeDirectory);
    await mkdir(directory, { recursive: true, mode: DOCKER_FILE_MODES.privateDirectory });
    if (process.platform !== DESKTOP_PLATFORM.windows) {
        await chmod(directory, DOCKER_FILE_MODES.privateDirectory);
        return directory;
    }
    const systemRoot = process.env[DESKTOP_ENVIRONMENT_KEYS.windowsSystemRoot];
    if (!systemRoot) throw new DesktopInfrastructureError("Windows system tools are unavailable. Restart the application from your Windows user session.");
    const systemDirectory = join(systemRoot, DESKTOP_FILES.windowsSystemDirectory);
    const user = await runInfrastructureProcess(join(systemDirectory, DESKTOP_FILES.whoamiExecutable), ["/user", "/fo", "csv", "/nh"], {
        signal, timeoutMs: DOCKER_TIMEOUTS_MS.permissions, failureMessage: "The Windows user identity could not be resolved for private infrastructure storage.",
    });
    const sid = DESKTOP_VALIDATION.windowsUserSid.exec(user)?.[0];
    if (!sid) throw new DesktopInfrastructureError("The Windows user identity could not be resolved for private infrastructure storage.");
    await runInfrastructureProcess(join(systemDirectory, DESKTOP_FILES.permissionsExecutable), [directory, "/inheritance:r", "/grant:r", `*${sid}:(OI)(CI)F`], {
        signal, timeoutMs: DOCKER_TIMEOUTS_MS.permissions, failureMessage: "Private infrastructure storage permissions could not be applied to your Windows user account.",
    });
    return directory;
}

export async function readInfrastructureCredentials(directory: string): Promise<InfrastructureCredentials | null> {
    let data: string;
    try { data = await readFile(join(directory, DOCKER_ASSET_FILES.credentials), "utf8"); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === DESKTOP_FILESYSTEM_ERROR_CODES.notFound) return null; throw error; }
    let value: unknown;
    try { value = JSON.parse(data); }
    catch { throw new DesktopInfrastructureError("Saved infrastructure credentials are damaged. Restore the private infrastructure directory from backup; do not regenerate its database encryption key."); }
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new DesktopInfrastructureError("Saved infrastructure credentials are invalid. Restore the private infrastructure directory from backup.");
    const credentials = value as Record<string, unknown>;
    if (credentials.version !== DOCKER_CREDENTIAL_SETTINGS.version || DOCKER_CREDENTIAL_SETTINGS.requiredFields.some(key => typeof credentials[key] !== "string" || !DOCKER_VALIDATION.secret.test(credentials[key] as string))) {
        throw new DesktopInfrastructureError("Saved infrastructure credentials are invalid. Restore the private infrastructure directory from backup.");
    }
    let upgraded = false;
    if (credentials.appPostgresUsername === undefined) { credentials.appPostgresUsername = `${DOCKER_CREDENTIAL_SETTINGS.usernamePrefix}${randomBytes(DOCKER_CREDENTIAL_SETTINGS.usernameBytes).toString(DOCKER_CREDENTIAL_SETTINGS.encoding)}`; upgraded = true; }
    if (credentials.appPostgresPassword === undefined) { credentials.appPostgresPassword = randomBytes(DOCKER_CREDENTIAL_SETTINGS.secretBytes).toString(DOCKER_CREDENTIAL_SETTINGS.encoding); upgraded = true; }
    if (credentials.appPostgresDatabase === undefined) { credentials.appPostgresDatabase = DOCKER_CREDENTIAL_SETTINGS.applicationDatabase; upgraded = true; }
    if (DOCKER_CREDENTIAL_SETTINGS.applicationSecretFields.some(key => typeof credentials[key] !== "string" || !DOCKER_VALIDATION.secret.test(credentials[key] as string))
        || typeof credentials.appPostgresDatabase !== "string" || !DOCKER_VALIDATION.databaseIdentifier.test(credentials.appPostgresDatabase)
        || DOCKER_CREDENTIAL_SETTINGS.deprecatedSecretFields.some(key => credentials[key] !== undefined && (typeof credentials[key] !== "string" || !DOCKER_VALIDATION.secret.test(credentials[key] as string)))) {
        throw new DesktopInfrastructureError("Saved infrastructure credentials are invalid. Restore the private infrastructure directory from backup.");
    }
    const result = credentials as unknown as InfrastructureCredentials;
    if (upgraded) await persistUpgradedCredentials(directory, result);
    return result;
}

export async function createInfrastructureCredentials(directory: string): Promise<InfrastructureCredentials> {
    const credentials: InfrastructureCredentials = {
        version: DOCKER_CREDENTIAL_SETTINGS.version,
        litellmMasterKey: `${DOCKER_CREDENTIAL_SETTINGS.litellmKeyPrefix}${randomBytes(DOCKER_CREDENTIAL_SETTINGS.secretBytes).toString(DOCKER_CREDENTIAL_SETTINGS.encoding)}`,
        litellmSaltKey: `${DOCKER_CREDENTIAL_SETTINGS.litellmKeyPrefix}${randomBytes(DOCKER_CREDENTIAL_SETTINGS.secretBytes).toString(DOCKER_CREDENTIAL_SETTINGS.encoding)}`,
        postgresUsername: `${DOCKER_CREDENTIAL_SETTINGS.usernamePrefix}${randomBytes(DOCKER_CREDENTIAL_SETTINGS.usernameBytes).toString(DOCKER_CREDENTIAL_SETTINGS.encoding)}`,
        postgresPassword: randomBytes(DOCKER_CREDENTIAL_SETTINGS.secretBytes).toString(DOCKER_CREDENTIAL_SETTINGS.encoding),
        milvusRootPassword: randomBytes(DOCKER_CREDENTIAL_SETTINGS.secretBytes).toString(DOCKER_CREDENTIAL_SETTINGS.encoding),
        ...applicationDatabaseCredentials(),
    };
    await writeFile(join(directory, DOCKER_ASSET_FILES.credentials), `${JSON.stringify(credentials, null, 2)}\n`, { flag: "wx", mode: DOCKER_FILE_MODES.privateFile });
    return credentials;
}

export async function writeInfrastructureConfiguration(
    directory: string,
    assetsDirectory: string,
    credentials: InfrastructureCredentials,
    ports: InfrastructurePorts,
    litellmDatabaseVolume: string,
): Promise<NodeJS.ProcessEnv> {
    if (!isAbsolute(assetsDirectory)) throw new DesktopInfrastructureError("Desktop infrastructure assets require an absolute application resource directory.");
    if (Object.values(ports).some(port => !Number.isInteger(port) || port < PRIVATE_PORT_RANGE.minimum || port > PRIVATE_PORT_RANGE.maximum)
        || new Set(Object.values(ports)).size !== DOCKER_PORT_KEYS.length) {
        throw new DesktopInfrastructureError(`${DOCKER_PORT_KEYS.length} distinct valid infrastructure host ports are required.`);
    }
    if (!DOCKER_VALIDATION.volumeName.test(litellmDatabaseVolume)) throw new DesktopInfrastructureError("A valid persisted LiteLLM database volume name is required.");
    await copyFile(join(assetsDirectory, DOCKER_ASSET_FILES.compose), join(directory, DOCKER_ASSET_FILES.compose));
    await copyFile(join(assetsDirectory, DOCKER_ASSET_FILES.embeddedEtcd), join(directory, DOCKER_ASSET_FILES.embeddedEtcd));
    try {
        await copyFile(join(assetsDirectory, DOCKER_ASSET_FILES.litellmConfiguration), join(directory, DOCKER_ASSET_FILES.litellmConfiguration), constants.COPYFILE_EXCL);
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== DESKTOP_FILESYSTEM_ERROR_CODES.alreadyExists) throw error;
    }
    const milvusTemplate = await readFile(join(assetsDirectory, DOCKER_ASSET_FILES.milvusTemplate), "utf8");
    const milvusConfiguration = milvusTemplate.replaceAll(DOCKER_CREDENTIAL_SETTINGS.milvusRootPasswordPlaceholder, credentials.milvusRootPassword);
    // The parent directory is user-only. Container user milvus must be able to read its mounted config.
    await writeFile(join(directory, DOCKER_ASSET_FILES.milvusConfiguration), milvusConfiguration, { mode: DOCKER_FILE_MODES.containerReadableFile });
    const variables = {
        [DOCKER_ENVIRONMENT_KEYS.litellmImage]: DOCKER_IMAGES.litellm,
        [DOCKER_ENVIRONMENT_KEYS.postgresqlImage]: DOCKER_IMAGES.postgresql,
        [DOCKER_ENVIRONMENT_KEYS.milvusImage]: DOCKER_IMAGES.milvus,
        [DOCKER_ENVIRONMENT_KEYS.ollamaImage]: DOCKER_IMAGES.ollama,
        [DOCKER_ENVIRONMENT_KEYS.litellmMasterKey]: credentials.litellmMasterKey,
        [DOCKER_ENVIRONMENT_KEYS.litellmSaltKey]: credentials.litellmSaltKey,
        [DOCKER_ENVIRONMENT_KEYS.postgresUsername]: credentials.postgresUsername,
        [DOCKER_ENVIRONMENT_KEYS.postgresPassword]: credentials.postgresPassword,
        [DOCKER_ENVIRONMENT_KEYS.applicationPostgresUsername]: credentials.appPostgresUsername,
        [DOCKER_ENVIRONMENT_KEYS.applicationPostgresPassword]: credentials.appPostgresPassword,
        [DOCKER_ENVIRONMENT_KEYS.applicationPostgresDatabase]: credentials.appPostgresDatabase,
        [DOCKER_ENVIRONMENT_KEYS.litellmDatabaseVolume]: litellmDatabaseVolume,
        [DOCKER_ENVIRONMENT_KEYS.litellmPort]: String(ports.litellm),
        [DOCKER_ENVIRONMENT_KEYS.milvusPort]: String(ports.milvus),
        [DOCKER_ENVIRONMENT_KEYS.ollamaPort]: String(ports.ollama),
        [DOCKER_ENVIRONMENT_KEYS.applicationDatabasePort]: String(ports.applicationDatabase),
        [DOCKER_ENVIRONMENT_KEYS.runtimeId]: infrastructureRuntimeId(directory),
    };
    await writeFile(join(directory, DOCKER_ASSET_FILES.environment), `${Object.entries(variables).map(([key, value]) => `${key}=${value}`).join("\n")}\n`, { mode: DOCKER_FILE_MODES.privateFile });
    return { ...process.env, ...variables, [DOCKER_ENVIRONMENT_KEYS.composeAnsi]: DOCKER_COMPOSE_OUTPUT.ansi, [DOCKER_ENVIRONMENT_KEYS.composeProgress]: DOCKER_COMPOSE_OUTPUT.progress };
}
