# DocSpyre Desktop

Tauri v2 desktop shell that packages the DocSpyre Angular webapp (`../docspyre-webapp`) into a native app for Windows, macOS, and Linux.

The webapp is **not** modified. This module only wraps it:
- **Dev**: Tauri starts the Angular dev server (`ng serve`) and loads `http://localhost:4200`.
- **Build**: Tauri runs `ng build` and bundles the static output from `../docspyre-webapp/dist/docspyre-webapp/browser`.

## Prerequisites

- Node.js + npm
- Rust toolchain (`rustc`, `cargo`) — https://rustup.rs
- Platform build deps for Tauri v2 — https://tauri.app/start/prerequisites

## Setup

```bash
npm install
```

## Run in development

```bash
npm run dev
```

## Build installers

```bash
npm run build          # release bundles
npm run build:debug    # debug bundle
```

Artifacts are emitted under `src-tauri/target/release/bundle/`:
- `docspyre-desktop.exe` — the raw executable (`src-tauri/target/release/`)
- `bundle/msi/DocSpyre_*.msi` and `bundle/nsis/DocSpyre_*-setup.exe` — Windows installers

## Backend connectivity

The desktop app is a native webview, so it does **not** share an origin with the
backend. It talks to the backend over an absolute URL, configured per build:

- **Dev** (`npm run dev`): uses `src/environments/environment.ts`
  (`http://localhost:8000/api/v1`).
- **Packaged** (`npm run build`): uses `src/environments/environment.desktop.ts`
  via the Angular `desktop` build configuration. Change the URL there to point
  at a remote backend.

For the backend to accept the app's requests, its `CORS_ORIGINS` must include the
Tauri webview origin(s):

```
CORS_ORIGINS="http://localhost:4200,http://tauri.localhost,tauri://localhost"
```

### Session handling

Desktop and browser use different refresh-token transports, negotiated by the
`X-Client-Type: desktop` header the app sends automatically:

- **Browser**: the refresh token stays in an HttpOnly cookie (mitigates XSS
  token theft). Unchanged.
- **Desktop**: the backend returns the refresh token in the response body and
  the app stores it client-side, sending it back on `/auth/refresh` and
  `/auth/logout`. The HttpOnly cookie isn't used because its cross-origin
  restrictions don't apply here and the XSS threat it guards against doesn't
  exist for a packaged native app. Silent refresh works normally.

## Customization

- App window, identifier, bundle targets: `src-tauri/tauri.conf.json`
- Native permissions (allowlist): `src-tauri/capabilities/default.json`
- Rust commands / plugins: `src-tauri/src/lib.rs`
- Regenerate icons from a square source image: `npm run icon <path-to-image.png>`

All desktop-specific configuration is isolated in this folder, so the webapp stays a standalone web project.
