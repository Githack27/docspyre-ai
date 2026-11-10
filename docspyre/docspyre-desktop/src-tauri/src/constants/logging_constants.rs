pub const FRONTEND_LOG_DIRECTORY: &str = "frontend";
pub const BACKEND_LOG_DIRECTORY: &str = "backend";
pub const FRONTEND_LOG_FILE: &str = "frontend.log";
pub const BACKEND_RUNTIME_LOG_FILE: &str = "runtime.log";
pub const MAXIMUM_LOG_FILE_BYTES: u64 = 5 * 1024 * 1024;
pub const MAXIMUM_LOG_MESSAGE_BYTES: usize = 16 * 1024;
pub const MAXIMUM_REDACTION_INPUT_BYTES: usize = 1024 * 1024;
pub const MAXIMUM_LOG_LEVEL_BYTES: usize = 32;
pub const REDACTED_VALUE: &str = "[REDACTED]";
pub const REDACTION_UNAVAILABLE: &str = "[Log message omitted: secret redaction unavailable]";
pub const OVERSIZED_LOG_MESSAGE: &str = "[Log message omitted: exceeds the safe redaction limit]";

pub const LOG_REDACTION_RULES: &[(&str, &str)] = &[
    (
        r"(?i)\b(bearer|basic)\s+[A-Za-z0-9+/_.=:-]+",
        "$1 [REDACTED]",
    ),
    (r"(?i)\b([a-z][a-z0-9+.-]*://)[^/\s?#@]+@", "$1[REDACTED]@"),
    (r#"([?&][^=\s&#"'<>]+\s*=)[^&#\s"'<>]*"#, "$1[REDACTED]"),
    (
        r#"(?i)(["']?[a-z0-9_/-]*(?:password|passwd|pwd|token|secret|api[_-]?key|access[_-]?key|credential|authorization|argv|arguments|environment|request[_-]?body|response[_-]?body)[a-z0-9_/-]*["']?\s*[:=]\s*)(?:"(?:\\.|[^"\\])*"?|'(?:\\.|[^'\\])*'?|[^\r\n,;}\]]*)"#,
        "$1[REDACTED]",
    ),
    (
        r#"(?i)(\b(?:access\s+key(?:\s+id)?|secret\s+access\s+key|api\s+key|client\s+secret)\s*[:=]\s*)(?:"(?:\\.|[^"\\])*"?|'(?:\\.|[^'\\])*'?|[^\r\n,;}\]]*)"#,
        "$1[REDACTED]",
    ),
    (
        r#"(?i)(--?[a-z0-9_-]*(?:password|passwd|token|secret|api[_-]?key|credential)[a-z0-9_-]*\s+)(?:"(?:\\.|[^"\\])*"?|'(?:\\.|[^'\\])*'?|[^\s,;]+)"#,
        "$1[REDACTED]",
    ),
    (
        r"\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b",
        "[REDACTED]",
    ),
    (
        r"\b(?:sk-[A-Za-z0-9_-]{8,}|gh[opusr]_[A-Za-z0-9_]+|github_pat_[A-Za-z0-9_]+|AKIA[A-Z0-9]{16})\b",
        "[REDACTED]",
    ),
];

