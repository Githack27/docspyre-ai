import { appendFile, mkdir, rename, stat, unlink } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import {
    DESKTOP_LOGGING,
    DESKTOP_LOG_REDACTION,
} from "../../constants/desktopLoggingConstants.js";

export interface DesktopLogOptions {
    level?: "info" | "warn" | "error";
    secretEnvironment?: NodeJS.ProcessEnv;
}

let pendingWrites = 0;
let writeQueue: Promise<void> = Promise.resolve();

/** Redact before truncating so a boundary cannot expose part of a known secret. */
export function redactDesktopLogText(text: string, secretEnvironment?: NodeJS.ProcessEnv): string {
    let redacted = text.replace(DESKTOP_LOG_REDACTION.terminalControl, "");
    const privateValues = new Set<string>();
    for (const environment of [process.env, secretEnvironment]) {
        if (!environment) continue;
        for (const [key, value] of Object.entries(environment)) {
            if (value && DESKTOP_LOG_REDACTION.privateKey.test(key)) {
                privateValues.add(value);
                try {
                    privateValues.add(encodeURIComponent(value));
                } catch {
                    // Malformed Unicode still receives exact-value redaction.
                }
            }
        }
    }
    for (const value of [...privateValues].sort((left, right) => right.length - left.length)) {
        redacted = redacted.replaceAll(value, DESKTOP_LOGGING.redacted);
    }
    return redacted
        .replace(DESKTOP_LOG_REDACTION.privateKeyBlock, DESKTOP_LOGGING.redacted)
        .replace(DESKTOP_LOG_REDACTION.uriUserInfo, `$1${DESKTOP_LOGGING.redacted}@`)
        .replace(DESKTOP_LOG_REDACTION.authorization, `$1 ${DESKTOP_LOGGING.redacted}`)
        .replace(DESKTOP_LOG_REDACTION.queryValue, `$1${DESKTOP_LOGGING.redacted}`)
        .replace(DESKTOP_LOG_REDACTION.quotedValue, (_match, prefix: string, quote: string) => `${prefix}${quote}${DESKTOP_LOGGING.redacted}${quote}`)
        .replace(DESKTOP_LOG_REDACTION.unquotedValue, `$1${DESKTOP_LOGGING.redacted}`);
}

function safeValue(value: unknown, environment: NodeJS.ProcessEnv | undefined, depth: number, seen: WeakSet<object>): unknown {
    if (typeof value === "string") {
        return redactDesktopLogText(value, environment).slice(0, DESKTOP_LOGGING.maximumTextCharacters);
    }
    if (value === null || typeof value === "boolean") return value;
    if (typeof value === "number") return Number.isFinite(value) ? value : null;
    if (typeof value !== "object") return undefined;
    if (depth >= DESKTOP_LOGGING.maximumDepth) return DESKTOP_LOGGING.truncated;
    if (seen.has(value)) return DESKTOP_LOGGING.circular;
    seen.add(value);
    if (Array.isArray(value)) {
        return value.slice(0, DESKTOP_LOGGING.maximumObjectFields).map(item => safeValue(item, environment, depth + 1, seen));
    }
    return Object.fromEntries(Object.entries(value).slice(0, DESKTOP_LOGGING.maximumObjectFields).map(([key, item]) => [
        key,
        DESKTOP_LOG_REDACTION.privateKey.test(key) ? DESKTOP_LOGGING.redacted : safeValue(item, environment, depth + 1, seen),
    ]));
}

/** Diagnostic logging must never interrupt desktop startup or emit protocol output. */
export async function writeDesktopLog(
    event: string,
    details: Readonly<Record<string, unknown>> = {},
    options: DesktopLogOptions = {},
): Promise<void> {
    const directory = process.env[DESKTOP_LOGGING.directoryEnvironmentKey];
    if (!directory || !isAbsolute(directory) || pendingWrites >= DESKTOP_LOGGING.maximumPendingWrites) return;
    let entry: string;
    try {
        const record = {
            timestamp: new Date().toISOString(),
            source: DESKTOP_LOGGING.source,
            level: options.level ?? "info",
            event: redactDesktopLogText(event, options.secretEnvironment).slice(0, DESKTOP_LOGGING.maximumEventCharacters),
            details: safeValue(details, options.secretEnvironment, 0, new WeakSet()),
        };
        entry = `${JSON.stringify(record)}\n`;
        if (Buffer.byteLength(entry) > DESKTOP_LOGGING.maximumEntryBytes) {
            entry = `${JSON.stringify({ ...record, details: DESKTOP_LOGGING.truncated })}\n`;
        }
    } catch {
        return;
    }
    pendingWrites += 1;
    const append = async () => {
        try {
            const backendDirectory = join(directory, DESKTOP_LOGGING.backendDirectory);
            const path = join(backendDirectory, DESKTOP_LOGGING.backendFile);
            await mkdir(backendDirectory, { recursive: true, mode: DESKTOP_LOGGING.directoryMode });
            let currentSize = 0;
            try {
                const file = await stat(path);
                if (!file.isFile()) return;
                currentSize = file.size;
            } catch (error) {
                if ((error as NodeJS.ErrnoException).code !== "ENOENT") return;
            }
            if (currentSize + Buffer.byteLength(entry) > DESKTOP_LOGGING.maximumFileBytes) {
                const backupPath = join(backendDirectory, DESKTOP_LOGGING.backendBackupFile);
                try {
                    await unlink(backupPath);
                } catch (error) {
                    if ((error as NodeJS.ErrnoException).code !== "ENOENT") return;
                }
                try {
                    await rename(path, backupPath);
                } catch (error) {
                    if ((error as NodeJS.ErrnoException).code !== "ENOENT") return;
                }
            }
            await appendFile(path, entry, { encoding: "utf8", mode: DESKTOP_LOGGING.fileMode, flag: "a" });
        } catch {
            // Logging failures are isolated from the infrastructure lifecycle.
        } finally {
            pendingWrites -= 1;
        }
    };
    writeQueue = writeQueue.then(append, append);
    await new Promise<void>(resolve => {
        const timer = setTimeout(resolve, DESKTOP_LOGGING.writeWaitMilliseconds);
        void writeQueue.finally(() => {
            clearTimeout(timer);
            resolve();
        });
    });
}
