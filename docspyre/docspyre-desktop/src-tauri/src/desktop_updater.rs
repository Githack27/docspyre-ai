//! Checks the DETQEL License Portal for a newer signed build as the first startup step, offers it to the
//! user, and installs it. Every outcome other than an accepted update lets startup continue: no update,
//! no answer within the check timeout, an unreachable server, or the user choosing to update later.
//!
//! Integrity does not depend on the server or the network. The Tauri updater installs a package only if
//! it is signed with the private key matching the public key compiled into this app (`plugins.updater.
//! pubkey`) and, with `requireSignedVersion`, only if that signature names the version announced.

use crate::constants::update_constants::{
    UPDATE_CHECK_TIMEOUT_SECONDS, UPDATE_DOWNLOAD_TIMEOUT_SECONDS, UPDATE_PRODUCT_CODE,
    UPDATE_SERVER_URL,
};
use crate::desktop_logs::DesktopLogs;
use serde::Serialize;
use std::sync::{Arc, Mutex, MutexGuard};
use std::time::Duration;
use tauri::{AppHandle, Manager, Url};
use tauri_plugin_updater::{Update, UpdaterExt};

const UP_TO_DATE: &str = "Up to date";
const SKIPPED_IN_DEVELOPMENT: &str = "Update checks are skipped in development builds";
const UNREACHABLE: &str = "Could not check for updates. Continuing with this version.";
const TIMED_OUT: &str = "The update server did not respond in time. Continuing with this version.";
const INSECURE: &str =
    "The update server is not configured securely. Continuing with this version.";
const INSTALL_FAILED: &str =
    "The update could not be installed. Check the connection, then try again or update later.";
const LOOPBACK_HOSTS: &[&str] = &["127.0.0.1", "localhost", "[::1]"];

#[derive(Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum UpdatePhase {
    /// Startup has not reached the update step yet.
    Idle,
    Checking,
    /// An update was found and waits for the user to install it or update later.
    Available,
    Downloading,
    /// Downloaded and verified; the installer is starting and the app will restart.
    Installing,
    /// Startup continued without updating.
    Done,
}

/// What the startup loader shows about the update step.
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateStatus {
    pub phase: UpdatePhase,
    pub current_version: String,
    pub version: Option<String>,
    /// Release notes, plain text, written by the publisher on the License Portal.
    pub notes: Option<String>,
    pub published_at: Option<String>,
    pub downloaded_bytes: u64,
    pub total_bytes: Option<u64>,
    pub error: Option<String>,
}

type Resume = Box<dyn FnOnce(String) + Send>;

struct Inner {
    status: UpdateStatus,
    pending: Option<Update>,
    /// Continues startup; taken exactly once, with the text shown on the update step.
    resume: Option<Resume>,
    logs: Option<Arc<DesktopLogs>>,
}

pub struct DesktopUpdater {
    inner: Mutex<Inner>,
}

/// HTTPS everywhere, or plain HTTP to this machine only (a local License Portal during development).
fn trusted_transport(url: &Url) -> bool {
    match url.scheme() {
        "https" => true,
        "http" => url
            .host_str()
            .is_some_and(|host| LOOPBACK_HOSTS.contains(&host)),
        _ => false,
    }
}

fn update_endpoint() -> Result<Url, String> {
    let base =
        Url::parse(UPDATE_SERVER_URL).map_err(|error| format!("Invalid update server: {error}"))?;
    if !trusted_transport(&base) || base.path() != "/" || base.query().is_some() {
        return Err(format!(
            "Refusing update server {UPDATE_SERVER_URL}: use an HTTPS origin."
        ));
    }
    // The updater fills in {{target}}, {{arch}} and {{current_version}}.
    let endpoint = format!(
        "{}/api/client/updates/{UPDATE_PRODUCT_CODE}/{{{{target}}}}/{{{{arch}}}}/{{{{current_version}}}}",
        base.as_str().trim_end_matches('/')
    );
    Url::parse(&endpoint).map_err(|error| format!("Invalid update endpoint: {error}"))
}

impl DesktopUpdater {
    pub fn new(current_version: String) -> Arc<Self> {
        Arc::new(Self {
            inner: Mutex::new(Inner {
                status: UpdateStatus {
                    phase: UpdatePhase::Idle,
                    current_version,
                    version: None,
                    notes: None,
                    published_at: None,
                    downloaded_bytes: 0,
                    total_bytes: None,
                    error: None,
                },
                pending: None,
                resume: None,
                logs: None,
            }),
        })
    }

    /// A poisoned lock only means another thread panicked while updating plain data; keep serving it.
    fn lock(&self) -> MutexGuard<'_, Inner> {
        self.inner
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
    }

    fn log(&self, level: &str, message: &str) {
        let logs = self.lock().logs.clone();
        if let Some(logs) = logs {
            logs.backend(level, &format!("[updater] {message}"));
        }
    }

    pub fn status(&self) -> UpdateStatus {
        self.lock().status.clone()
    }

    /// Starts the update check. `resume` continues startup and receives the text for the update step.
    pub fn start<F: FnOnce(String) + Send + 'static>(self: &Arc<Self>, app: &AppHandle, resume: F) {
        {
            let mut inner = self.lock();
            if inner.status.phase != UpdatePhase::Idle {
                return;
            }
            inner.status.phase = UpdatePhase::Checking;
            inner.resume = Some(Box::new(resume));
            inner.logs = app
                .try_state::<Arc<DesktopLogs>>()
                .map(|logs| logs.inner().clone());
        }
        if tauri::is_dev() {
            self.finish(SKIPPED_IN_DEVELOPMENT);
            return;
        }
        let endpoint = match update_endpoint() {
            Ok(endpoint) => endpoint,
            Err(error) => {
                self.log("error", &error);
                self.finish(INSECURE);
                return;
            }
        };
        self.log(
            "info",
            &format!("Checking {UPDATE_SERVER_URL} for a newer release."),
        );

        let checker = self.clone();
        let handle = app.clone();
        tauri::async_runtime::spawn(async move {
            let exit_logs = checker.lock().logs.clone();
            let result = async {
                handle
                    .updater_builder()
                    .endpoints(vec![endpoint])?
                    .timeout(Duration::from_secs(UPDATE_CHECK_TIMEOUT_SECONDS))
                    .on_before_exit(move || {
                        if let Some(logs) = &exit_logs {
                            logs.backend(
                                "info",
                                "[updater] Closing so the installer can update the app.",
                            );
                        }
                    })
                    .build()?
                    .check()
                    .await
            }
            .await;
            match result {
                Ok(Some(update)) => checker.offer(update),
                Ok(None) => checker.finish(UP_TO_DATE),
                Err(error) => {
                    checker.log("warn", &format!("Update check failed: {error}"));
                    checker.finish(UNREACHABLE);
                }
            }
        });

        // A hard deadline, independent of how the request itself behaves (DNS stalls, slow proxies).
        let watchdog = self.clone();
        std::thread::spawn(move || {
            std::thread::sleep(Duration::from_secs(UPDATE_CHECK_TIMEOUT_SECONDS));
            if watchdog.status().phase == UpdatePhase::Checking {
                watchdog.log("warn", "The update check timed out.");
                watchdog.finish(TIMED_OUT);
            }
        });
    }

    fn offer(&self, update: Update) {
        let mut inner = self.lock();
        // The deadline may already have passed and startup moved on.
        if inner.status.phase != UpdatePhase::Checking {
            return;
        }
        inner.status.phase = UpdatePhase::Available;
        inner.status.version = Some(update.version.clone());
        inner.status.notes = update.body.clone();
        inner.status.published_at = update.date.map(|date| date.to_string());
        inner.pending = Some(update);
        drop(inner);
        self.log("info", "A newer release is available.");
    }

    /// Continues startup without updating. Only possible while checking or deciding.
    fn finish(&self, detail: &str) {
        let resume = {
            let mut inner = self.lock();
            if !matches!(
                inner.status.phase,
                UpdatePhase::Checking | UpdatePhase::Available
            ) {
                return;
            }
            inner.status.phase = UpdatePhase::Done;
            inner.pending = None;
            inner.resume.take()
        };
        if let Some(resume) = resume {
            resume(detail.to_owned());
        }
    }

    /// The user chose to update later.
    pub fn skip(&self) -> Result<(), String> {
        let version = {
            let inner = self.lock();
            if inner.status.phase != UpdatePhase::Available {
                return Err("No update is waiting for a decision.".into());
            }
            inner.status.current_version.clone()
        };
        self.log("info", "The user postponed the update.");
        self.finish(&format!(
            "Update postponed. Continuing with version {version}."
        ));
        Ok(())
    }

    /// Downloads, verifies and installs the offered update. On Windows the installer closes this app,
    /// updates it and starts it again; elsewhere the app restarts itself once the update is in place.
    pub fn install(self: &Arc<Self>, app: &AppHandle) -> Result<(), String> {
        let mut update = {
            let mut inner = self.lock();
            if inner.status.phase != UpdatePhase::Available {
                return Err("No update is waiting to be installed.".into());
            }
            let update = inner
                .pending
                .clone()
                .ok_or("No update is waiting to be installed.")?;
            if !trusted_transport(&update.download_url) {
                inner.status.error = Some(INSTALL_FAILED.into());
                drop(inner);
                self.log(
                    "error",
                    "Refusing an update download over an insecure connection.",
                );
                return Err(INSTALL_FAILED.into());
            }
            inner.status.phase = UpdatePhase::Downloading;
            inner.status.error = None;
            inner.status.downloaded_bytes = 0;
            inner.status.total_bytes = None;
            update
        };
        update.timeout = Some(Duration::from_secs(UPDATE_DOWNLOAD_TIMEOUT_SECONDS));
        self.log("info", &format!("Downloading version {}.", update.version));

        let installer = self.clone();
        let handle = app.clone();
        tauri::async_runtime::spawn(async move {
            let progress = installer.clone();
            let verified = installer.clone();
            let downloaded = update
                .download(
                    move |chunk, total| {
                        let mut inner = progress.lock();
                        inner.status.downloaded_bytes += chunk as u64;
                        inner.status.total_bytes = total;
                    },
                    move || verified.lock().status.phase = UpdatePhase::Installing,
                )
                .await;
            // `download` has verified the signature and signed version; `install` checks them again.
            let result = downloaded.and_then(|bytes| {
                installer.log("info", "Update verified. Starting the installer.");
                update.install(bytes)
            });
            match result {
                // Windows exits inside `install`; other platforms restart into the new version here.
                Ok(()) => handle.restart(),
                Err(error) => {
                    installer.log("error", &format!("Update failed: {error}"));
                    let mut inner = installer.lock();
                    inner.status.phase = UpdatePhase::Available;
                    inner.status.error = Some(INSTALL_FAILED.into());
                }
            }
        });
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::{trusted_transport, update_endpoint};
    use tauri::Url;

    #[test]
    fn only_https_or_this_machine_is_trusted() {
        for url in [
            "https://licenses.example.com/x",
            "http://127.0.0.1:3012/",
            "http://localhost/",
        ] {
            assert!(trusted_transport(&Url::parse(url).unwrap()), "{url}");
        }
        for url in [
            "http://licenses.example.com/",
            "http://127.0.0.1.evil.com/",
            "ftp://127.0.0.1/",
        ] {
            assert!(!trusted_transport(&Url::parse(url).unwrap()), "{url}");
        }
    }

    #[test]
    fn the_endpoint_keeps_the_updater_placeholders() {
        let endpoint = update_endpoint().unwrap().to_string();
        assert!(
            endpoint.ends_with("/%7B%7Btarget%7D%7D/%7B%7Barch%7D%7D/%7B%7Bcurrent_version%7D%7D")
        );
        assert!(endpoint.contains("/api/client/updates/"));
    }
}
