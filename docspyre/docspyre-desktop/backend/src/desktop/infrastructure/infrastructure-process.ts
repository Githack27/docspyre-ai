import { spawn } from "node:child_process";
import { basename } from "node:path";
import { StringDecoder } from "node:string_decoder";
import { DOCKER_LIMITS, DOCKER_PROCESS_FAILURE_RULES } from "../../constants/dockerConstants.js";
import {
    DESKTOP_LOG_EVENTS,
    DESKTOP_LOGGING,
    DESKTOP_PROCESS_OPERATION,
    DESKTOP_PROCESS_OUTCOMES,
    DESKTOP_REGISTRY_FAILURE_RULES,
} from "../../constants/desktopLoggingConstants.js";
import { redactDesktopLogText, writeDesktopLog } from "../../shared/logging/desktop-logs.js";
import { DesktopInfrastructureError } from "./infrastructure-error.js";

interface ProcessOptions {
    signal: AbortSignal;
    timeoutMs: number;
    failureMessage: string;
    cwd?: string;
    env?: NodeJS.ProcessEnv;
    onActivity?: () => void;
}

function processFailureMessage(diagnostics: string, failureMessage: string): string {
    const rule = [...DOCKER_PROCESS_FAILURE_RULES, ...DESKTOP_REGISTRY_FAILURE_RULES]
        .find(item => item.pattern.test(diagnostics));
    if (rule) return rule.message;
    return failureMessage;
}

function processOperation(command: string, args: readonly string[]): string {
    if (!DESKTOP_PROCESS_OPERATION.dockerExecutable.test(basename(command))) return DESKTOP_PROCESS_OPERATION.unknown;
    if (args[0] === DESKTOP_PROCESS_OPERATION.composeArgument) {
        const operation = args.slice(1).find(argument => DESKTOP_PROCESS_OPERATION.composeCommands.has(argument));
        return operation ? `${DESKTOP_PROCESS_OPERATION.compose}.${operation}` : DESKTOP_PROCESS_OPERATION.compose;
    }
    const operation = args[0];
    if (!operation || !DESKTOP_PROCESS_OPERATION.dockerCommands.has(operation)) return DESKTOP_PROCESS_OPERATION.docker;
    const subcommand = args[1];
    return subcommand && DESKTOP_PROCESS_OPERATION.dockerSubcommands.has(subcommand)
        ? `docker.${operation}.${subcommand}`
        : `docker.${operation}`;
}

/** Only redacted stderr is logged; command arguments, environment and stdout remain private. */
export function runInfrastructureProcess(command: string, args: string[], options: ProcessOptions): Promise<string> {
    if (options.signal.aborted) return Promise.reject(new DesktopInfrastructureError("Desktop infrastructure startup was cancelled."));
    return new Promise((resolve, reject) => {
        const startedAt = Date.now();
        const operation = processOperation(command, args);
        void writeDesktopLog(DESKTOP_LOG_EVENTS.processStarted, { operation, timeoutMs: options.timeoutMs }, { secretEnvironment: options.env });
        const child = spawn(command, args, {
            cwd: options.cwd,
            env: options.env,
            shell: false,
            windowsHide: true,
            stdio: ["ignore", "pipe", "pipe"],
        });
        let output = "";
        let diagnostics = "";
        const stderrDecoder = new StringDecoder("utf8");
        const captureDiagnostics = (text: string) => {
            const combined = diagnostics + text;
            diagnostics = combined.length > DOCKER_LIMITS.captureBytes
                ? redactDesktopLogText(combined, options.env).slice(-DOCKER_LIMITS.captureBytes)
                : combined;
        };
        let settled = false;
        const finish = async (
            outcome: typeof DESKTOP_PROCESS_OUTCOMES[keyof typeof DESKTOP_PROCESS_OUTCOMES],
            error?: DesktopInfrastructureError,
            exitCode?: number | null,
            exitSignal?: NodeJS.Signals | null,
        ) => {
            if (settled) return;
            settled = true;
            const capturedDiagnostics = redactDesktopLogText(diagnostics, options.env)
                .slice(-DESKTOP_LOGGING.maximumTextCharacters);
            diagnostics = "";
            clearTimeout(timer);
            options.signal.removeEventListener("abort", cancel);
            await writeDesktopLog(DESKTOP_LOG_EVENTS.processFinished, {
                operation,
                outcome,
                durationMs: Date.now() - startedAt,
                exitCode,
                exitSignal,
                stderr: capturedDiagnostics,
            }, { level: error ? "error" : "info", secretEnvironment: options.env });
            if (error) reject(error);
            else resolve(output.trim());
        };
        const cancel = () => {
            child.kill();
            void finish(DESKTOP_PROCESS_OUTCOMES.cancelled, new DesktopInfrastructureError("Desktop infrastructure startup was cancelled."));
        };
        const timer = setTimeout(() => {
            child.kill();
            void finish(DESKTOP_PROCESS_OUTCOMES.timedOut, new DesktopInfrastructureError(`${options.failureMessage} The operation exceeded its startup time limit.`));
        }, options.timeoutMs);
        options.signal.addEventListener("abort", cancel, { once: true });
        if (options.signal.aborted) { cancel(); return; }
        child.stdout.on("data", (chunk: Buffer) => {
            if (output.length < DOCKER_LIMITS.captureBytes) output += chunk.toString("utf8").slice(0, DOCKER_LIMITS.captureBytes - output.length);
            options.onActivity?.();
        });
        child.stderr.on("data", (chunk: Buffer) => {
            captureDiagnostics(stderrDecoder.write(chunk));
            options.onActivity?.();
        });
        child.once("error", () => {
            void finish(DESKTOP_PROCESS_OUTCOMES.spawnFailed, new DesktopInfrastructureError(options.failureMessage));
        });
        child.once("close", (code, exitSignal) => {
            captureDiagnostics(stderrDecoder.end());
            void finish(
                code === 0 ? DESKTOP_PROCESS_OUTCOMES.succeeded : DESKTOP_PROCESS_OUTCOMES.failed,
                code === 0 ? undefined : new DesktopInfrastructureError(processFailureMessage(diagnostics, options.failureMessage)),
                code,
                exitSignal,
            );
        });
    });
}

export function startupDelay(milliseconds: number, signal: AbortSignal): Promise<void> {
    if (signal.aborted) return Promise.reject(new DesktopInfrastructureError("Desktop infrastructure startup was cancelled."));
    return new Promise((resolve, reject) => {
        const abort = () => {
            clearTimeout(timer);
            reject(new DesktopInfrastructureError("Desktop infrastructure startup was cancelled."));
        };
        const timer = setTimeout(() => {
            signal.removeEventListener("abort", abort);
            resolve();
        }, milliseconds);
        signal.addEventListener("abort", abort, { once: true });
        if (signal.aborted) abort();
    });
}
