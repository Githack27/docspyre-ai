pub const ANGULAR_CLI_PATH: &str = "../node_modules/@angular/cli/bin/ng.js";
pub const FRONTEND_SOURCE_DIRECTORY: &str = "../frontend";
pub const FRONTEND_REQUEST_TIMEOUT_SECONDS: u64 = 5;
pub const FRONTEND_POLL_INTERVAL_MS: u64 = 500;
pub const FRONTEND_RUNTIME_FAILURE: &str = "The frontend could not start. See the frontend logs.";
pub const STARTUP_ASSET_CSP: &str = "default-src 'none'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self'; connect-src ipc: http://ipc.localhost; object-src 'none'; base-uri 'none'; frame-src 'none'";

pub const FRONTEND_DIAGNOSTICS_SCRIPT: &str = r#"
(() => {
  // Restrict desktop context menu (preventing Inspect Element & Reload)
  window.addEventListener('contextmenu', event => {
    event.preventDefault();
  }, true);

  // Restrict keyboard shortcuts for DevTools (F12, Ctrl+Shift+I/J/C) and Refresh (F5, Ctrl+R)
  window.addEventListener('keydown', event => {
    // F12 -> DevTools
    if (event.key === 'F12' || event.keyCode === 123) {
      event.preventDefault();
      event.stopPropagation();
      return false;
    }
    // Ctrl+Shift+I / Ctrl+Shift+J / Ctrl+Shift+C -> DevTools
    if ((event.ctrlKey || event.metaKey) && event.shiftKey && ['i', 'I', 'j', 'J', 'c', 'C'].includes(event.key)) {
      event.preventDefault();
      event.stopPropagation();
      return false;
    }
    // Ctrl+U -> View Source
    if ((event.ctrlKey || event.metaKey) && ['u', 'U'].includes(event.key)) {
      event.preventDefault();
      event.stopPropagation();
      return false;
    }
    // F5, Ctrl+F5, Ctrl+R, Ctrl+Shift+R -> Browser Refresh
    if (
      event.key === 'F5' ||
      event.keyCode === 116 ||
      ((event.ctrlKey || event.metaKey) && ['r', 'R'].includes(event.key))
    ) {
      event.preventDefault();
      event.stopPropagation();
      return false;
    }
  }, true);

  const serialize = value => {
    if (value instanceof Error) return value.stack || value.message;
    if (value === null) return 'null';
    if (['string', 'number', 'boolean', 'undefined', 'bigint'].includes(typeof value)) return String(value);
    return `[${typeof value} omitted]`;
  };
  const report = (level, values) => {
    const invoke = window.__TAURI__?.core?.invoke;
    if (invoke) void invoke('frontend_log', { level, message: values.map(serialize).join(' ') }).catch(() => {});
  };
  window.addEventListener('error', event => {
    report('error', [event.error || `${event.message} (${event.filename}:${event.lineno}:${event.colno})`]);
  });
  window.addEventListener('unhandledrejection', event => report('error', ['Unhandled promise rejection:', event.reason]));
  for (const level of ['error', 'warn']) {
    const original = console[level].bind(console);
    console[level] = (...values) => { report(level, values); original(...values); };
  }
})();
"#;

