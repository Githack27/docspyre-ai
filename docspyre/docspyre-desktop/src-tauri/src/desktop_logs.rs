use crate::constants::logging_constants::{
    BACKEND_LOG_DIRECTORY, BACKEND_RUNTIME_LOG_FILE, FRONTEND_LOG_DIRECTORY, FRONTEND_LOG_FILE,
    LOG_REDACTION_RULES, MAXIMUM_LOG_FILE_BYTES, MAXIMUM_LOG_LEVEL_BYTES,
    MAXIMUM_LOG_MESSAGE_BYTES, MAXIMUM_REDACTION_INPUT_BYTES, OVERSIZED_LOG_MESSAGE,
    REDACTED_VALUE, REDACTION_UNAVAILABLE,
};
use regex::Regex;
use std::{
    fs::{self, File, OpenOptions},
    io::{self, BufRead, Write},
    path::{Path, PathBuf},
    sync::{Mutex, RwLock},
    time::{SystemTime, UNIX_EPOCH},
};

struct RotatingLog {
    path: PathBuf,
    backup: PathBuf,
    file: Option<File>,
    bytes: u64,
}

impl RotatingLog {
    fn new(path: PathBuf) -> io::Result<Self> {
        let file = open_private_file(&path)?;
        let bytes = file.metadata()?.len();
        Ok(Self {
            backup: path.with_extension("log.1"),
            path,
            file: Some(file),
            bytes,
        })
    }

    fn append(&mut self, record: &[u8]) -> io::Result<()> {
        if self.file.is_none() {
            let file = open_private_file(&self.path)?;
            self.bytes = file.metadata()?.len();
            self.file = Some(file);
        }
        if self.bytes.saturating_add(record.len() as u64) > MAXIMUM_LOG_FILE_BYTES {
            // Close first: Windows does not permit renaming an open log file.
            self.file.take();
            match fs::remove_file(&self.backup) {
                Ok(()) => {}
                Err(error) if error.kind() == io::ErrorKind::NotFound => {}
                Err(error) => return Err(error),
            }
            fs::rename(&self.path, &self.backup)?;
            self.file = Some(open_private_file(&self.path)?);
            self.bytes = 0;
        }
        if let Some(file) = self.file.as_mut() {
            file.write_all(record)?;
            self.bytes = self.bytes.saturating_add(record.len() as u64);
        }
        Ok(())
    }
}

fn create_private_directory(path: &Path) -> io::Result<()> {
    fs::create_dir_all(path)?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(path, fs::Permissions::from_mode(0o700))?;
    }
    Ok(())
}

fn open_private_file(path: &Path) -> io::Result<File> {
    let mut options = OpenOptions::new();
    options.create(true).append(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    let file = options.open(path)?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        file.set_permissions(fs::Permissions::from_mode(0o600))?;
    }
    Ok(file)
}

fn bounded_text(value: &str, maximum_bytes: usize) -> &str {
    let mut end = value.len().min(maximum_bytes);
    while !value.is_char_boundary(end) {
        end -= 1;
    }
    &value[..end]
}

/// Discard oversized lines completely so a truncated credential cannot reach the logger.
pub fn read_diagnostic_lines(
    mut reader: impl BufRead,
    mut on_line: impl FnMut(&str),
) -> io::Result<()> {
    let mut line = Vec::new();
    let mut oversized = false;
    loop {
        let available = reader.fill_buf()?;
        if available.is_empty() {
            if oversized {
                on_line(OVERSIZED_LOG_MESSAGE);
            } else if !line.is_empty() {
                on_line(&String::from_utf8_lossy(&line));
            }
            return Ok(());
        }
        let newline = available.iter().position(|byte| *byte == b'\n');
        let content_length = newline.unwrap_or(available.len());
        if !oversized {
            if line.len().saturating_add(content_length) > MAXIMUM_REDACTION_INPUT_BYTES {
                line.clear();
                oversized = true;
            } else {
                line.extend_from_slice(&available[..content_length]);
            }
        }
        reader.consume(content_length + usize::from(newline.is_some()));
        if newline.is_some() {
            if oversized {
                on_line(OVERSIZED_LOG_MESSAGE);
            } else {
                if line.last() == Some(&b'\r') {
                    line.pop();
                }
                on_line(&String::from_utf8_lossy(&line));
            }
            line.clear();
            oversized = false;
        }
    }
}

/// Shared native diagnostics. Callers must not submit environment, argv, or request/response bodies.
pub struct DesktopLogs {
    directory: PathBuf,
    frontend_file: Mutex<RotatingLog>,
    backend_file: Mutex<RotatingLog>,
    secrets: RwLock<Vec<String>>,
    redaction_rules: Vec<(Regex, &'static str)>,
}

impl DesktopLogs {
    pub fn new(directory: PathBuf) -> io::Result<Self> {
        create_private_directory(&directory)?;
        let frontend = directory.join(FRONTEND_LOG_DIRECTORY);
        let backend = directory.join(BACKEND_LOG_DIRECTORY);
        create_private_directory(&frontend)?;
        create_private_directory(&backend)?;
        let redaction_rules = LOG_REDACTION_RULES
            .iter()
            .map(|(pattern, replacement)| {
                Regex::new(pattern)
                    .map(|regex| (regex, *replacement))
                    .map_err(|_| {
                        io::Error::new(
                            io::ErrorKind::InvalidInput,
                            "Desktop log redaction configuration is invalid",
                        )
                    })
            })
            .collect::<io::Result<Vec<_>>>()?;
        Ok(Self {
            frontend_file: Mutex::new(RotatingLog::new(frontend.join(FRONTEND_LOG_FILE))?),
            backend_file: Mutex::new(RotatingLog::new(backend.join(BACKEND_RUNTIME_LOG_FILE))?),
            directory,
            secrets: RwLock::new(Vec::new()),
            redaction_rules,
        })
    }

    pub fn directory(&self) -> &Path {
        &self.directory
    }

    pub fn add_secret(&self, value: &str) {
        if value.is_empty() {
            return;
        }
        if let Ok(mut secrets) = self.secrets.write() {
            if !secrets.iter().any(|secret| secret == value) {
                secrets.push(value.to_owned());
                secrets.sort_by_key(|secret| std::cmp::Reverse(secret.len()));
            }
        }
    }

    pub fn frontend(&self, level: &str, message: &str) {
        self.write(&self.frontend_file, level, message);
    }

    pub fn backend(&self, level: &str, message: &str) {
        self.write(&self.backend_file, level, message);
    }

    fn redact(&self, message: &str) -> String {
        if message.len() > MAXIMUM_REDACTION_INPUT_BYTES {
            return OVERSIZED_LOG_MESSAGE.to_owned();
        }
        let mut value = message.to_owned();
        let Ok(secrets) = self.secrets.read() else {
            return REDACTION_UNAVAILABLE.to_owned();
        };
        for secret in secrets.iter() {
            value = value.replace(secret, REDACTED_VALUE);
        }
        drop(secrets);
        for (pattern, replacement) in &self.redaction_rules {
            value = pattern.replace_all(&value, *replacement).into_owned();
        }
        let sanitized: String = value
            .chars()
            .filter(|character| !character.is_control() || matches!(*character, '\n' | '\t'))
            .collect();
        bounded_text(&sanitized, MAXIMUM_LOG_MESSAGE_BYTES).to_owned()
    }

    fn write(&self, output: &Mutex<RotatingLog>, level: &str, message: &str) {
        let Ok(timestamp) = SystemTime::now().duration_since(UNIX_EPOCH) else {
            return;
        };
        let sanitized_level = self.redact(level);
        let level: String = bounded_text(&sanitized_level, MAXIMUM_LOG_LEVEL_BYTES)
            .chars()
            .filter(|character| !character.is_control())
            .collect();
        let record = serde_json::json!({
            "timestampUnixMs": timestamp.as_millis().min(u64::MAX as u128) as u64,
            "level": level,
            "message": self.redact(message),
        });
        let Ok(mut encoded) = serde_json::to_vec(&record) else {
            return;
        };
        encoded.push(b'\n');
        if let Ok(mut file) = output.lock() {
            let _ = file.append(&encoded);
        }
    }
}

