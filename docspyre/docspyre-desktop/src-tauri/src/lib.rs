mod constants;
mod desktop_logs;
mod desktop_updater;
mod frontend_runtime;
mod startup_assets;

use constants::desktop_constants::{
    APPLICATION_NAME, APP_VERSION_ENV, BACKEND_API_STEP, BACKEND_RUNTIME_STEP,
    BACKEND_STATUS_COMMAND, CONTAINER_RUNTIME_ENV, CONTAINER_RUNTIME_EXECUTABLES, CREATE_NO_WINDOW,
    DESKTOP_LOG_DIRECTORY_ENV, DEVELOPMENT_BINARY_DIRECTORY, DEVELOPMENT_LOG_DIRECTORY,
    DOCKER_OWNERSHIP_LABEL, DOCKER_STOP_TIMEOUT_SECONDS, FRONTEND_STEP, FRONTEND_TIMEOUT_SECONDS,
    LOGO_DARK, LOGO_LIGHT, MAIN_WINDOW, NAME_LOGO_DARK, NAME_LOGO_LIGHT, NODE_BINARY_NAME,
    STARTUP_ASSET_HOST, STARTUP_ASSET_SCHEME, STARTUP_PAGE, STARTUP_POLL_INTERVAL_MS,
    STARTUP_READY_COMMAND, STARTUP_READY_TIMEOUT_SECONDS, STARTUP_STEPS, STARTUP_WINDOW,
    STARTUP_WINDOW_HEIGHT, STARTUP_WINDOW_MINIMUM_HEIGHT, STARTUP_WINDOW_MINIMUM_WIDTH,
    STARTUP_WINDOW_WIDTH, THEME_STORAGE_KEY,
};
use constants::frontend_constants::{FRONTEND_DIAGNOSTICS_SCRIPT, FRONTEND_RUNTIME_FAILURE};
use constants::network_constants::{
    API_BODY_LIMIT_BYTES, API_STREAM_LINE_LIMIT_BYTES, API_STREAM_MAX_CONCURRENT,
    API_STREAM_TIMEOUT_SECONDS, LOCAL_HTTP_SCHEME, LOOPBACK_HOST, PRIVATE_PORT_MAXIMUM,
    PRIVATE_PORT_MINIMUM,
};
use constants::update_constants::{UPDATE_INSTALL_COMMAND, UPDATE_SKIP_COMMAND, UPDATE_STEP};
use desktop_logs::{read_diagnostic_lines, DesktopLogs};
use desktop_updater::{DesktopUpdater, UpdateStatus};
use frontend_runtime::FrontendRuntime;
use serde::{Deserialize, Serialize};
use std::{
    io::{BufReader, Write},
    path::PathBuf,
    process::{Child, Command, Stdio},
    sync::{mpsc, Arc, Mutex},
    time::{Duration, Instant},
};
use tauri::Manager;

struct Backend {
    child: Option<Child>,
    address: Option<String>,
    token: String,
    error: Option<String>,
    config_path: PathBuf,
    steps: Vec<StartupStep>,
    started_at: Instant,
    finished_at: Option<Instant>,
    stopping: bool,
    shutdown_initiated: bool,
    frontend_ready: bool,
    launch_started: bool,
    opened: bool,
    logs: Option<Arc<DesktopLogs>>,
}

impl Backend {
    fn fail(&mut self, message: String) {
        let api_was_ready = self.address.is_some();
        self.address = None;
        if let Some(logs) = &self.logs {
            logs.backend("error", &message);
        }
        if self.error.is_none() {
            self.error = Some(sanitize_startup_text(&message, 2048));
        }
        self.finished_at = Some(Instant::now());
        for step in &mut self.steps {
            if step.id != FRONTEND_STEP
                && (matches!(step.status, StartupStepStatus::Running)
                    || (api_was_ready && step.id == BACKEND_API_STEP))
            {
                step.status = StartupStepStatus::Error;
                if step.detail.is_none() {
                    step.detail = self.error.clone();
                }
            }
        }
    }

    fn stop(&mut self) {
        self.stopping = true;
        if let Some(mut child) = self.child.take() {
            if let Some(mut stdin) = child.stdin.take() {
                let _ = stdin.write_all(b"shutdown\n");
            }
            let deadline = Instant::now() + Duration::from_secs(7);
            while Instant::now() < deadline {
                if matches!(child.try_wait(), Ok(Some(_))) {
                    return;
                }
                std::thread::sleep(Duration::from_millis(50));
            }
            let _ = child.kill();
            let _ = child.wait();
        }
    }
}

impl Drop for Backend {
    fn drop(&mut self) {
        self.stop();
    }
}

type SharedBackend = Arc<Mutex<Backend>>;

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "lowercase")]
enum StartupStepStatus {
    Pending,
    Running,
    Complete,
    Error,
}

#[derive(Clone, Deserialize, Serialize)]
struct StartupStep {
    id: String,
    label: String,
    status: StartupStepStatus,
    detail: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct BackendStatus {
    ready: bool,
    error: Option<String>,
    config_path: String,
    steps: Vec<StartupStep>,
    elapsed_seconds: u64,
    logs_directory: Option<String>,
    update: UpdateStatus,
}

fn update_startup_step(shared: &SharedBackend, id: &str, status: StartupStepStatus) {
    set_startup_step(shared, id, status, None);
}

fn set_startup_step(
    shared: &SharedBackend,
    id: &str,
    status: StartupStepStatus,
    detail: Option<String>,
) {
    if let Ok(mut backend) = shared.lock() {
        if let Some(step) = backend.steps.iter_mut().find(|step| step.id == id) {
            step.status = status;
            step.detail = detail;
        }
    }
}

fn reveal_workspace(app: &tauri::AppHandle, shared: &SharedBackend) -> Result<(), String> {
    {
        let mut backend = shared.lock().map_err(|_| "Backend state unavailable")?;
        if backend.opened
            || backend.stopping
            || backend.error.is_some()
            || backend.address.is_none()
            || !backend.frontend_ready
            || !backend
                .steps
                .iter()
                .all(|step| matches!(step.status, StartupStepStatus::Complete))
        {
            return Ok(());
        }
        backend.opened = true;
    }
    let result = app
        .get_webview_window(MAIN_WINDOW)
        .ok_or("The main application window is unavailable")
        .and_then(|window| {
            window
                .show()
                .map_err(|_| "The application window could not be shown")
        });
    if let Err(message) = result {
        if let Ok(mut backend) = shared.lock() {
            backend.opened = false;
            backend.fail(message.to_owned());
        }
        return Err(message.to_owned());
    }
    if let Ok(mut backend) = shared.lock() {
        backend.finished_at = Some(Instant::now());
    }
    if let Some(window) = app.get_webview_window(MAIN_WINDOW) {
        let _ = window.set_focus();
    }
    if let Some(window) = app.get_webview_window(STARTUP_WINDOW) {
        let _ = window.hide();
    }
    Ok(())
}

#[tauri::command]
async fn startup_ready(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    state: tauri::State<'_, SharedBackend>,
) -> Result<(), String> {
    if window.label() != STARTUP_WINDOW {
        return Err("Only the startup loader can begin application startup".into());
    }
    let shared = state.inner().clone();
    {
        let mut backend = shared.lock().map_err(|_| "Backend state unavailable")?;
        if backend.launch_started || backend.stopping {
            return Ok(());
        }
        backend.launch_started = true;
    }
    // Checking for a newer release comes first; the services start once the update step is settled.
    set_startup_step(
        &shared,
        UPDATE_STEP,
        StartupStepStatus::Running,
        Some("Checking for updates...".into()),
    );
    let launch_app = app.clone();
    let launch_state = shared.clone();
    app.state::<Arc<DesktopUpdater>>()
        .inner()
        .clone()
        .start(&app, move |detail| {
            set_startup_step(
                &launch_state,
                UPDATE_STEP,
                StartupStepStatus::Complete,
                Some(detail),
            );
            launch_frontend(launch_app, launch_state);
        });
    Ok(())
}

#[tauri::command]
fn update_install(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    updater: tauri::State<'_, Arc<DesktopUpdater>>,
) -> Result<(), String> {
    if window.label() != STARTUP_WINDOW {
        return Err("Only the startup loader can install updates".into());
    }
    updater.install(&app)
}

#[tauri::command]
fn update_skip(
    window: tauri::WebviewWindow,
    updater: tauri::State<'_, Arc<DesktopUpdater>>,
) -> Result<(), String> {
    if window.label() != STARTUP_WINDOW {
        return Err("Only the startup loader can postpone updates".into());
    }
    updater.skip()
}

/// Starts the frontend, which in turn starts the backend once it has mounted.
fn launch_frontend(app: tauri::AppHandle, shared: SharedBackend) {
    if shared.lock().map_or(true, |backend| backend.stopping) {
        return;
    }
    let logs = app.state::<Arc<DesktopLogs>>().inner().clone();
    logs.frontend(
        "info",
        "The embedded startup loader is visible. Starting application services.",
    );
    update_startup_step(&shared, FRONTEND_STEP, StartupStepStatus::Running);
    let frontend_app = app.clone();
    let frontend_state = shared.clone();
    tauri::async_runtime::spawn(async move {
        let result = async {
            frontend_runtime::start(&frontend_app, logs.clone()).await?;
            {
                let backend = frontend_state
                    .lock()
                    .map_err(|_| "Backend state unavailable")?;
                if backend.stopping && backend.error.is_none() {
                    return Ok::<(), String>(());
                }
            }
            create_frontend_window(&frontend_app).map_err(|error| error.to_string())?;
            let monitor_state = frontend_state.clone();
            std::thread::spawn(move || monitor_frontend_startup(monitor_state));
            Ok(())
        }
        .await;
        if let Err(error) = result {
            logs.frontend("error", &error);
            update_startup_step(&frontend_state, FRONTEND_STEP, StartupStepStatus::Error);
            fail_startup(
                &frontend_state,
                format!("{FRONTEND_RUNTIME_FAILURE} {error}"),
            );
            frontend_app.state::<FrontendRuntime>().stop();
        }
    });
}

#[tauri::command]
async fn frontend_ready(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    state: tauri::State<'_, SharedBackend>,
) -> Result<(), String> {
    if window.label() != MAIN_WINDOW {
        return Err("Only the main frontend can report readiness".into());
    }
    let shared = state.inner().clone();
    let should_start_backend = {
        let mut backend = shared.lock().map_err(|_| "Backend state unavailable")?;
        if backend.frontend_ready || backend.stopping {
            false
        } else {
            backend.frontend_ready = true;
            if let Some(logs) = &backend.logs {
                logs.frontend(
                    "info",
                    "Main frontend mounted and native IPC readiness confirmed.",
                );
            }
            true
        }
    };
    if should_start_backend {
        update_startup_step(&shared, FRONTEND_STEP, StartupStepStatus::Complete);
        let backend_app = app.clone();
        let backend_shared = shared.clone();
        std::thread::spawn(move || {
            if let Err(error) = start_backend(&backend_app, backend_shared.clone()) {
                fail_startup(
                    &backend_shared,
                    format!("Unable to start the packaged backend: {error}"),
                );
            }
        });
    }
    reveal_workspace(&app, &shared)
}

#[tauri::command]
async fn frontend_log(
    window: tauri::WebviewWindow,
    state: tauri::State<'_, Arc<DesktopLogs>>,
    level: String,
    message: String,
) -> Result<(), String> {
    if ![MAIN_WINDOW, STARTUP_WINDOW].contains(&window.label())
        || !matches!(level.as_str(), "info" | "warn" | "error")
    {
        return Err("Invalid frontend diagnostic event".into());
    }
    state.frontend(&level, &format!("[{}] {message}", window.label()));
    Ok(())
}

#[tauri::command]
fn backend_status(
    app: tauri::AppHandle,
    state: tauri::State<'_, SharedBackend>,
    updater: tauri::State<'_, Arc<DesktopUpdater>>,
) -> Result<BackendStatus, String> {
    let mut backend = state.lock().map_err(|_| "Backend state unavailable")?;
    if tauri::is_dev() && backend.launch_started && !backend.stopping {
        let frontend_error = match app.state::<FrontendRuntime>().exit_status() {
            Ok(Some(status)) => Some(format!(
                "The frontend process stopped ({status}). See the frontend logs."
            )),
            Err(error) => Some(format!("Unable to monitor the frontend process: {error}")),
            Ok(None) => None,
        };
        if let Some(error) = frontend_error {
            if let Some(step) = backend
                .steps
                .iter_mut()
                .find(|step| step.id == FRONTEND_STEP)
            {
                step.status = StartupStepStatus::Error;
            }
            if let Some(logs) = &backend.logs {
                logs.frontend("error", &error);
            }
            backend.fail(error);
            backend.stop();
        }
    }
    let process_error = if backend.address.is_some() && backend.error.is_none() {
        backend
            .child
            .as_mut()
            .and_then(|child| match child.try_wait() {
                Ok(Some(status)) => Some(format!(
                    "The desktop backend stopped ({status}). Restart the application to reconnect."
                )),
                Err(error) => Some(format!("Unable to monitor the desktop backend: {error}")),
                Ok(None) => None,
            })
    } else {
        None
    };
    if let Some(error) = process_error {
        backend.fail(error);
    }
    Ok(BackendStatus {
        ready: backend.address.is_some() && backend.frontend_ready && backend.error.is_none(),
        error: backend.error.clone(),
        config_path: backend.config_path.display().to_string(),
        steps: backend.steps.clone(),
        logs_directory: backend
            .logs
            .as_ref()
            .map(|logs| logs.directory().display().to_string()),
        elapsed_seconds: backend
            .finished_at
            .unwrap_or_else(Instant::now)
            .saturating_duration_since(backend.started_at)
            .as_secs(),
        update: updater.status(),
    })
}

fn sanitize_startup_text(value: &str, limit: usize) -> String {
    value
        .chars()
        .filter(|character| !character.is_control() || matches!(*character, '\n' | '\t'))
        .take(limit)
        .collect()
}

fn valid_backend_address(address: &str) -> bool {
    let Ok(url) = reqwest::Url::parse(address) else {
        return false;
    };
    url.scheme() == LOCAL_HTTP_SCHEME
        && url.host_str() == Some(LOOPBACK_HOST)
        && url
            .port()
            .is_some_and(|port| (PRIVATE_PORT_MINIMUM..=PRIVATE_PORT_MAXIMUM).contains(&port))
        && url.username().is_empty()
        && url.password().is_none()
        && url.path() == "/"
        && url.query().is_none()
        && url.fragment().is_none()
}

fn fail_startup(shared: &SharedBackend, message: String) {
    if let Ok(mut backend) = shared.lock() {
        backend.fail(message);
        backend.stop();
    }
}

fn supervise_startup(
    app: tauri::AppHandle,
    shared: SharedBackend,
    receiver: mpsc::Receiver<serde_json::Value>,
) {
    let logs = app.state::<Arc<DesktopLogs>>().inner().clone();
    let deadline = Instant::now() + Duration::from_secs(60 * 60);
    loop {
        let value = match receiver.recv_timeout(deadline.saturating_duration_since(Instant::now()))
        {
            Ok(value) => value,
            Err(mpsc::RecvTimeoutError::Timeout) => {
                fail_startup(&shared, "Application startup exceeded 60 minutes. Review Docker and service availability, then restart the application.".into());
                return;
            }
            Err(mpsc::RecvTimeoutError::Disconnected) => {
                fail_startup(
                    &shared,
                    "The startup manager stopped before the application API became ready.".into(),
                );
                return;
            }
        };
        if value.get("type").and_then(|value| value.as_str()) == Some("startup") {
            let step = value
                .get("step")
                .cloned()
                .and_then(|step| serde_json::from_value::<StartupStep>(step).ok());
            let Some(mut step) = step else {
                fail_startup(
                    &shared,
                    "The startup manager reported an invalid progress event.".into(),
                );
                return;
            };
            if step.id.is_empty()
                || step.id.len() > 100
                || step.label.trim().is_empty()
                || !step.id.chars().all(|character| {
                    character.is_ascii_alphanumeric() || matches!(character, '-' | '_' | '.')
                })
            {
                fail_startup(
                    &shared,
                    "The startup manager reported an invalid progress identifier or label.".into(),
                );
                return;
            }
            step.label = sanitize_startup_text(&step.label, 200);
            step.detail = step
                .detail
                .map(|detail| sanitize_startup_text(&detail, 2048));
            if step.id == FRONTEND_STEP {
                continue;
            }
            if let Ok(event) = serde_json::to_string(&step) {
                logs.backend("info", &event);
            }
            if let Ok(mut backend) = shared.lock() {
                if let Some(existing) = backend
                    .steps
                    .iter_mut()
                    .find(|existing| existing.id == step.id)
                {
                    *existing = step;
                } else {
                    backend.steps.push(step);
                }
            }
        }
        if let Some(ready) = value.get("ready") {
            if ready.as_bool() == Some(true) {
                let address = value.get("address").and_then(|address| address.as_str());
                let Some(address) = address.filter(|address| valid_backend_address(address)) else {
                    fail_startup(
                        &shared,
                        "The backend reported an invalid local API address.".into(),
                    );
                    return;
                };
                if let Ok(mut backend) = shared.lock() {
                    if backend.error.is_none() && !backend.stopping {
                        backend.address = Some(address.trim_end_matches('/').to_owned());
                    }
                }
                let _ = reveal_workspace(&app, &shared);
                logs.backend("info", "Backend API readiness confirmed.");
            } else if ready.as_bool() == Some(false) {
                let message = value
                    .get("error")
                    .and_then(|error| error.as_str())
                    .filter(|error| !error.trim().is_empty());
                match message {
                    Some(message) => fail_startup(&shared, message.to_owned()),
                    None => fail_startup(
                        &shared,
                        "The startup manager reported failure without an error message.".into(),
                    ),
                }
            } else {
                fail_startup(
                    &shared,
                    "The startup manager reported an invalid readiness event.".into(),
                );
            }
            return;
        }
    }
}

fn valid_api_path(path: &str) -> bool {
    path.starts_with("/api/")
        && !path.contains(['\\', '\r', '\n', '#'])
        && !path.split('?').next().unwrap_or("").split('/').any(|part| {
            let decoded = part.to_ascii_lowercase().replace("%2e", ".");
            decoded == ".." || decoded == "." || decoded.contains("%2f") || decoded.contains("%5c")
        })
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ApiResponse {
    status: u16,
    body: String,
    body_bytes: Option<Vec<u8>>,
    content_type: String,
}

fn build_api_request(
    state: &SharedBackend,
    client: &reqwest::Client,
    path: &str,
    method: &str,
    body: Option<String>,
    body_bytes: Option<Vec<u8>>,
    headers: Option<std::collections::HashMap<String, String>>,
    authorization: Option<String>,
) -> Result<reqwest::RequestBuilder, String> {
    if !valid_api_path(path) {
        return Err("Only application API paths are allowed".into());
    }
    if !matches!(method, "GET" | "POST" | "PUT" | "PATCH" | "DELETE") {
        return Err("Unsupported API method".into());
    }
    if body
        .as_ref()
        .is_some_and(|body| body.len() > API_BODY_LIMIT_BYTES)
        || body_bytes
            .as_ref()
            .is_some_and(|bytes| bytes.len() > API_BODY_LIMIT_BYTES)
    {
        return Err("Request exceeds the API body limit".into());
    }
    let (address, token) = {
        let backend = state.lock().map_err(|_| "Backend state unavailable")?;
        (
            backend.address.clone().ok_or("Backend is not ready")?,
            backend.token.clone(),
        )
    };
    let method = reqwest::Method::from_bytes(method.as_bytes()).map_err(|_| "Invalid method")?;
    let mut request = client
        .request(method, format!("{address}{path}"))
        .header("x-docspyre-desktop-token", token);
    if let Some(authorization) = authorization {
        if !authorization.starts_with("Bearer ") || authorization.len() > 4096 {
            return Err("Invalid session authorization header".into());
        }
        request = request.header("Authorization", authorization);
    }
    if let Some(headers) = headers {
        for (k, v) in headers {
            if let (Ok(name), Ok(val)) = (
                reqwest::header::HeaderName::from_bytes(k.as_bytes()),
                reqwest::header::HeaderValue::from_str(&v),
            ) {
                request = request.header(name, val);
            }
        }
    }
    if let Some(bytes) = body_bytes {
        request = request.body(bytes);
    } else if let Some(body) = body {
        request = request
            .header("Content-Type", "application/json")
            .body(body);
    }
    Ok(request)
}

fn response_content_type(response: &reqwest::Response) -> String {
    response
        .headers()
        .get("content-type")
        .and_then(|value| value.to_str().ok())
        .unwrap_or("application/json")
        .to_owned()
}

#[tauri::command]
async fn api_request(
    state: tauri::State<'_, SharedBackend>,
    client: tauri::State<'_, reqwest::Client>,
    path: String,
    method: String,
    body: Option<String>,
    body_bytes: Option<Vec<u8>>,
    headers: Option<std::collections::HashMap<String, String>>,
    authorization: Option<String>,
) -> Result<ApiResponse, String> {
    let response = build_api_request(
        &state,
        &client,
        &path,
        &method,
        body,
        body_bytes,
        headers,
        authorization,
    )?
    .send()
    .await
    .map_err(|_| "The local API request failed")?;
    let status = response.status().as_u16();
    let content_type = response_content_type(&response);
    let is_text = content_type.starts_with("text/")
        || content_type.contains("json")
        || content_type.contains("xml")
        || content_type.contains("javascript");
    let (body, body_bytes) = if is_text {
        (
            response
                .text()
                .await
                .map_err(|_| "Unable to read API response")?,
            None,
        )
    } else {
        let bytes = response
            .bytes()
            .await
            .map_err(|_| "Unable to read API response")?;
        (String::new(), Some(bytes.to_vec()))
    };
    Ok(ApiResponse {
        status,
        body,
        body_bytes,
        content_type,
    })
}

#[derive(Clone, Serialize)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
enum ApiStreamMessage {
    Start { status: u16, content_type: String },
    Data { text: String },
    End,
    Error { message: String },
}

#[derive(Default)]
struct ApiStreams(Mutex<std::collections::HashMap<String, tauri::async_runtime::JoinHandle<()>>>);

fn take_complete_lines(buffer: &mut Vec<u8>) -> Option<String> {
    let end = buffer.iter().rposition(|byte| *byte == b'\n')? + 1;
    let rest = buffer.split_off(end);
    let lines = std::mem::replace(buffer, rest);
    Some(String::from_utf8_lossy(&lines).into_owned())
}

fn valid_stream_id(id: &str) -> bool {
    uuid::Uuid::parse_str(id).is_ok()
}

async fn forward_stream(
    request: reqwest::RequestBuilder,
    channel: tauri::ipc::Channel<ApiStreamMessage>,
) {
    let fail = |message: &str| {
        let _ = channel.send(ApiStreamMessage::Error {
            message: message.into(),
        });
    };
    let mut response = match request
        .timeout(Duration::from_secs(API_STREAM_TIMEOUT_SECONDS))
        .send()
        .await
    {
        Ok(response) => response,
        Err(_) => return fail("The local API request failed"),
    };
    let start = ApiStreamMessage::Start {
        status: response.status().as_u16(),
        content_type: response_content_type(&response),
    };
    if channel.send(start).is_err() {
        return;
    }
    let mut buffer = Vec::new();
    loop {
        let chunk = match response.chunk().await {
            Ok(Some(chunk)) => chunk,
            Ok(None) => break,
            Err(_) => return fail("Streaming from the local API failed"),
        };
        if buffer.len().saturating_add(chunk.len()) > API_STREAM_LINE_LIMIT_BYTES {
            return fail("Stream response exceeded the line limit");
        }
        buffer.extend_from_slice(&chunk);
        while let Some(line) = take_complete_lines(&mut buffer) {
            if channel.send(ApiStreamMessage::Data { text: line }).is_err() {
                return;
            }
        }
    }
    if !buffer.is_empty() {
        let text = String::from_utf8_lossy(&buffer).into_owned();
        if channel.send(ApiStreamMessage::Data { text }).is_err() {
            return;
        }
    }
    let _ = channel.send(ApiStreamMessage::End);
}

#[tauri::command]
async fn api_stream(
    state: tauri::State<'_, SharedBackend>,
    client: tauri::State<'_, reqwest::Client>,
    streams: tauri::State<'_, Arc<ApiStreams>>,
    stream_id: String,
    path: String,
    method: String,
    body: Option<String>,
    authorization: Option<String>,
    on_event: tauri::ipc::Channel<ApiStreamMessage>,
) -> Result<(), String> {
    if !valid_stream_id(&stream_id) {
        return Err("Invalid stream identifier".into());
    }
    let request = build_api_request(
        &state,
        &client,
        &path,
        &method,
        body,
        None,
        None,
        authorization,
    )?;
    let registry = streams.inner().clone();
    let mut active = registry.0.lock().map_err(|_| "Stream state unavailable")?;
    active.retain(|_, handle| !handle.inner().is_finished());
    if active.contains_key(&stream_id) {
        return Err("The stream identifier is already in use".into());
    }
    if active.len() >= API_STREAM_MAX_CONCURRENT {
        return Err("Too many API streams are open".into());
    }
    let finished = registry.clone();
    let id = stream_id.clone();
    let handle = tauri::async_runtime::spawn(async move {
        forward_stream(request, on_event).await;
        if let Ok(mut active) = finished.0.lock() {
            active.remove(&id);
        }
    });
    active.insert(stream_id, handle);
    Ok(())
}

#[tauri::command]
fn api_stream_cancel(
    streams: tauri::State<'_, Arc<ApiStreams>>,
    stream_id: String,
) -> Result<(), String> {
    if !valid_stream_id(&stream_id) {
        return Err("Invalid stream identifier".into());
    }
    let handle = streams
        .0
        .lock()
        .map_err(|_| "Stream state unavailable")?
        .remove(&stream_id);
    if let Some(handle) = handle {
        handle.abort();
    }
    Ok(())
}

fn start_backend(
    app: &tauri::AppHandle,
    shared: SharedBackend,
) -> Result<(), Box<dyn std::error::Error>> {
    let logs = app.state::<Arc<DesktopLogs>>().inner().clone();
    logs.backend("info", "Starting the managed backend process.");
    update_startup_step(&shared, BACKEND_RUNTIME_STEP, StartupStepStatus::Running);
    let resources = app.path().resource_dir()?;
    let runtime_dir = app.path().app_config_dir()?.join("runtime");
    std::fs::create_dir_all(&runtime_dir)?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&runtime_dir, std::fs::Permissions::from_mode(0o700))?;
    }
    let manifest = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let (node, entry, working_dir, config_path) = if tauri::is_dev() {
        let backend = manifest.join("../backend");
        let node = manifest.join(DEVELOPMENT_BINARY_DIRECTORY).join(format!(
            "{NODE_BINARY_NAME}-{}{}",
            env!("DOCSPYRE_TARGET"),
            std::env::consts::EXE_SUFFIX
        ));
        (
            node,
            backend.join("src/desktop-entry.ts"),
            backend.clone(),
            backend.join(".env"),
        )
    } else {
        let config_dir = app.path().app_config_dir()?;
        std::fs::create_dir_all(&config_dir)?;
        let config = config_dir.join("backend.env");
        match std::fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&config)
        {
            Ok(mut file) => {
                file.write_all(&std::fs::read(resources.join("backend/.env.example"))?)?;
                #[cfg(unix)]
                {
                    use std::os::unix::fs::PermissionsExt;
                    file.set_permissions(std::fs::Permissions::from_mode(0o600))?;
                }
            }
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => {}
            Err(error) => return Err(error.into()),
        }
        (
            std::env::current_exe()?.with_file_name(format!(
                "{NODE_BINARY_NAME}{}",
                std::env::consts::EXE_SUFFIX
            )),
            resources.join("backend/dist/desktop-entry.js"),
            resources.join("backend"),
            config,
        )
    };
    let token = {
        let mut backend = shared.lock().map_err(|_| "Backend state unavailable")?;
        if backend.stopping {
            return Err("Application shutdown is in progress".into());
        }
        backend.config_path = config_path.clone();
        backend.token.clone()
    };
    let mut command = Command::new(node);
    if tauri::is_dev() {
        command.arg("--import").arg("tsx");
    }
    command
        .arg(entry)
        .current_dir(working_dir)
        .env_remove("NODE_OPTIONS")
        .env_remove("NODE_PATH")
        .env("DOCSPYRE_CONFIG_PATH", config_path)
        .env("DOCSPYRE_RUNTIME_DIR", runtime_dir)
        .env(APP_VERSION_ENV, app.package_info().version.to_string())
        .env(DESKTOP_LOG_DIRECTORY_ENV, logs.directory())
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(CREATE_NO_WINDOW);
    }
    let mut child = command.spawn()?;
    let stdout = child.stdout.take().ok_or("Backend output unavailable")?;
    let stderr = child
        .stderr
        .take()
        .ok_or("Backend diagnostics unavailable")?;
    let initialization = format!("{}\n", serde_json::json!({ "token": token }));
    if let Err(error) = child
        .stdin
        .as_mut()
        .ok_or("Backend input unavailable")?
        .write_all(initialization.as_bytes())
    {
        let _ = child.kill();
        let _ = child.wait();
        return Err(error.into());
    }
    match shared.lock() {
        Ok(mut backend) if !backend.stopping => backend.child = Some(child),
        _ => {
            let _ = child.kill();
            let _ = child.wait();
            return Err("Application shutdown is in progress".into());
        }
    }
    let (sender, receiver) = mpsc::channel();
    let stdout_logs = logs.clone();
    std::thread::spawn(move || {
        let reader = BufReader::new(stdout);
        let result = read_diagnostic_lines(reader, |line| {
            if let Ok(value) = serde_json::from_str::<serde_json::Value>(line) {
                let _ = sender.send(value);
            } else {
                stdout_logs.backend("info", line);
            }
        });
        if let Err(error) = result {
            stdout_logs.backend("error", &format!("Unable to read backend output: {error}"));
        }
    });
    std::thread::spawn(move || {
        let reader = BufReader::new(stderr);
        let result = read_diagnostic_lines(reader, |line| logs.backend("error", line));
        if let Err(error) = result {
            logs.backend(
                "error",
                &format!("Unable to read backend diagnostics: {error}"),
            );
        }
    });
    let handle = app.clone();
    std::thread::spawn(move || supervise_startup(handle, shared, receiver));
    Ok(())
}

fn owned_container_query_args() -> [String; 4] {
    [
        "ps".into(),
        "-q".into(),
        "--filter".into(),
        format!("label={DOCKER_OWNERSHIP_LABEL}"),
    ]
}

fn container_runtime_candidates() -> Vec<String> {
    let mut candidates: Vec<String> = CONTAINER_RUNTIME_EXECUTABLES
        .iter()
        .map(|executable| (*executable).to_owned())
        .collect();
    if let Ok(requested) = std::env::var(CONTAINER_RUNTIME_ENV) {
        let normalized = requested.trim().to_ascii_lowercase();
        let executable = match normalized.as_str() {
            "" => None,
            "rancher" => Some("nerdctl".to_owned()),
            other => Some(other.to_owned()),
        };
        if let Some(executable) = executable {
            candidates.retain(|candidate| candidate != &executable);
            candidates.insert(0, executable);
        }
    }
    candidates
}

fn run_runtime_command<F>(configure: F) -> Option<std::process::Output>
where
    F: Fn(&mut Command),
{
    for executable in container_runtime_candidates() {
        let mut command = Command::new(&executable);
        configure(&mut command);
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            command.creation_flags(CREATE_NO_WINDOW);
        }
        match command.output() {
            Ok(output) => return Some(output),
            Err(_) => continue,
        }
    }
    None
}

fn stop_owned_docker_containers(logs: Option<&Arc<DesktopLogs>>) {
    let Some(output) = run_runtime_command(|command| {
        command.args(owned_container_query_args());
    }) else {
        return;
    };
    let stdout = String::from_utf8_lossy(&output.stdout);
    let ids: Vec<&str> = stdout
        .split_whitespace()
        .filter(|id| !id.is_empty())
        .collect();
    if !ids.is_empty() {
        if let Some(logs) = logs {
            logs.backend(
                "info",
                &format!("Stopping {} running managed containers...", ids.len()),
            );
        }
        let _ = run_runtime_command(|command| {
            command
                .arg("stop")
                .arg("--time")
                .arg(DOCKER_STOP_TIMEOUT_SECONDS)
                .args(&ids);
        });
    }
}

fn perform_graceful_shutdown(app: &tauri::AppHandle, shared: &SharedBackend) {
    {
        let mut backend = match shared.lock() {
            Ok(b) => b,
            Err(_) => {
                app.exit(0);
                return;
            }
        };
        if backend.shutdown_initiated {
            app.exit(0);
            return;
        }
        backend.shutdown_initiated = true;
        backend.stopping = true;
    }

    if let Some(main_win) = app.get_webview_window(MAIN_WINDOW) {
        let _ = main_win.hide();
    }

    if let Some(startup_win) = app.get_webview_window(STARTUP_WINDOW) {
        let _ = startup_win.show();
        let _ = startup_win.set_focus();
        let _ = startup_win
            .eval("window.__DOCSPYRE_STARTUP_SHUTDOWN__ && window.__DOCSPYRE_STARTUP_SHUTDOWN__();");
    }

    let app_handle = app.clone();
    let shared_state = shared.clone();

    std::thread::spawn(move || {
        let logs = shared_state.lock().ok().and_then(|b| b.logs.clone());

        if let Some(startup_win) = app_handle.get_webview_window(STARTUP_WINDOW) {
            let _ = startup_win.eval("window.__DOCSPYRE_UPDATE_SHUTDOWN__ && window.__DOCSPYRE_UPDATE_SHUTDOWN__('Stopping Docker containers...', 35);");
        }

        stop_owned_docker_containers(logs.as_ref());

        if let Some(startup_win) = app_handle.get_webview_window(STARTUP_WINDOW) {
            let _ = startup_win.eval("window.__DOCSPYRE_UPDATE_SHUTDOWN__ && window.__DOCSPYRE_UPDATE_SHUTDOWN__('Stopping platform backend & services...', 75);");
        }

        if let Ok(mut backend) = shared_state.lock() {
            backend.stop();
        }

        app_handle.state::<FrontendRuntime>().stop();

        if let Some(startup_win) = app_handle.get_webview_window(STARTUP_WINDOW) {
            let _ = startup_win.eval("window.__DOCSPYRE_UPDATE_SHUTDOWN__ && window.__DOCSPYRE_UPDATE_SHUTDOWN__('All services stopped.', 100);");
        }

        std::thread::sleep(Duration::from_millis(450));
        app_handle.exit(0);
    });
}

fn create_startup_loader(app: &tauri::App) -> tauri::Result<()> {
    let configuration = serde_json::json!({
        "applicationName": APPLICATION_NAME,
        "themeStorageKey": THEME_STORAGE_KEY,
        "pollIntervalMs": STARTUP_POLL_INTERVAL_MS,
        "statusCommand": BACKEND_STATUS_COMMAND,
        "readyCommand": STARTUP_READY_COMMAND,
        "updateInstallCommand": UPDATE_INSTALL_COMMAND,
        "updateSkipCommand": UPDATE_SKIP_COMMAND,
        "logoLight": LOGO_LIGHT,
        "logoDark": LOGO_DARK,
        "nameLogoLight": NAME_LOGO_LIGHT,
        "nameLogoDark": NAME_LOGO_DARK,
    });
    let url = format!("{STARTUP_ASSET_SCHEME}://{STARTUP_ASSET_HOST}/{STARTUP_PAGE}")
        .parse()
        .expect("Embedded startup URL must be valid");
    tauri::WebviewWindowBuilder::new(app, STARTUP_WINDOW, tauri::WebviewUrl::CustomProtocol(url))
        .title(APPLICATION_NAME)
        .devtools(false)
        .disable_drag_drop_handler()
        .initialization_script(format!(
            "window.__DOCSPYRE_STARTUP_CONFIG__ = {configuration};"
        ))
        .initialization_script(FRONTEND_DIAGNOSTICS_SCRIPT)
        .inner_size(STARTUP_WINDOW_WIDTH, STARTUP_WINDOW_HEIGHT)
        .min_inner_size(STARTUP_WINDOW_MINIMUM_WIDTH, STARTUP_WINDOW_MINIMUM_HEIGHT)
        .center()
        .visible(true)
        .build()?;
    Ok(())
}

fn create_frontend_window(app: &tauri::AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let configuration = app
        .config()
        .app
        .windows
        .iter()
        .find(|window| window.label == MAIN_WINDOW)
        .ok_or("Main frontend window configuration is unavailable")?;
    tauri::WebviewWindowBuilder::from_config(app, configuration)?
        .devtools(false)
        .disable_drag_drop_handler()
        .initialization_script(FRONTEND_DIAGNOSTICS_SCRIPT)
        .build()?;
    Ok(())
}

fn monitor_frontend_startup(shared: SharedBackend) {
    let deadline = Instant::now() + Duration::from_secs(FRONTEND_TIMEOUT_SECONDS);
    loop {
        match shared.lock() {
            Ok(backend)
                if backend.frontend_ready || (backend.stopping && backend.error.is_none()) =>
            {
                return
            }
            Err(_) => return,
            _ => {}
        }
        if Instant::now() >= deadline {
            update_startup_step(&shared, FRONTEND_STEP, StartupStepStatus::Error);
            if let Ok(backend) = shared.lock() {
                if let Some(logs) = &backend.logs {
                    logs.frontend("error", "The main frontend did not confirm hydration and IPC readiness before the startup deadline.");
                }
            }
            fail_startup(&shared, "The frontend did not finish loading. Restart the application or reinstall its packaged frontend assets.".into());
            return;
        }
        std::thread::sleep(Duration::from_millis(STARTUP_POLL_INTERVAL_MS));
    }
}

pub fn run() {
    let shared = Arc::new(Mutex::new(Backend {
        child: None,
        address: None,
        token: uuid::Uuid::new_v4().to_string(),
        error: None,
        config_path: PathBuf::new(),
        steps: STARTUP_STEPS
            .iter()
            .map(|(id, label)| StartupStep {
                id: (*id).to_owned(),
                label: (*label).to_owned(),
                status: StartupStepStatus::Pending,
                detail: None,
            })
            .collect(),
        started_at: Instant::now(),
        finished_at: None,
        stopping: false,
        shutdown_initiated: false,
        frontend_ready: false,
        launch_started: false,
        opened: false,
        logs: None,
    }));
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(shared.clone())
        .manage(FrontendRuntime::default())
        .register_uri_scheme_protocol(STARTUP_ASSET_SCHEME, |_context, request| startup_assets::respond(&request))
        .manage(
            reqwest::Client::builder()
                .no_proxy()
                .redirect(reqwest::redirect::Policy::none())
                .timeout(Duration::from_secs(180))
                .build()
                .expect("HTTP client initialization failed"),
        )
        .manage(Arc::new(ApiStreams::default()))
        .invoke_handler(tauri::generate_handler![
            startup_ready,
            backend_status,
            api_request,
            api_stream,
            api_stream_cancel,
            frontend_ready,
            frontend_log,
            update_install,
            update_skip
        ])
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let shared = window.state::<SharedBackend>();
                perform_graceful_shutdown(window.app_handle(), &shared);
            }
        })
        .setup(move |app| {
            let logs_directory = if tauri::is_dev() {
                let native_directory = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
                native_directory.parent().ok_or("Desktop project directory is unavailable")?
                    .join(DEVELOPMENT_LOG_DIRECTORY)
            } else {
                app.path().app_log_dir()?
            };
            let logs = Arc::new(DesktopLogs::new(logs_directory)?);
            {
                let mut backend = shared.lock().map_err(|_| "Backend state unavailable")?;
                logs.add_secret(&backend.token);
                backend.logs = Some(logs.clone());
            }
            logs.backend("info", "Desktop startup initialized.");
            logs.frontend("info", "Opening the standalone startup loader.");
            app.manage(logs.clone());
            app.manage(DesktopUpdater::new(app.package_info().version.to_string()));
            create_startup_loader(app)?;
            let loader_state = shared.clone();
            std::thread::spawn(move || {
                let deadline = Instant::now() + Duration::from_secs(STARTUP_READY_TIMEOUT_SECONDS);
                loop {
                    match loader_state.lock() {
                        Ok(backend) if backend.launch_started || backend.stopping => return,
                        Err(_) => return,
                        _ => {}
                    }
                    if Instant::now() >= deadline {
                        fail_startup(&loader_state, "The embedded startup loader did not initialize. See the frontend logs.".into());
                        return;
                    }
                    std::thread::sleep(Duration::from_millis(STARTUP_POLL_INTERVAL_MS));
                }
            });
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("Desktop runtime initialization failed");
    app.run(|app, event| {
        if matches!(event, tauri::RunEvent::Exit) {
            app.state::<FrontendRuntime>().stop();
            if let Ok(mut backend) = app.state::<SharedBackend>().lock() {
                backend.stop();
            }
            stop_owned_docker_containers(None);
        }
    });
}
