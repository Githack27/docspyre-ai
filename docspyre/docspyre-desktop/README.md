# DocSpyre Desktop

Self-contained desktop application built with Tauri v2 and Angular.

The Angular frontend UI and Tauri Rust desktop shell are integrated directly into this project, allowing the entire application to be compiled and bundled into native desktop packages for Windows, macOS, and Linux.

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

This starts the Angular dev server and launches the Tauri desktop application.

## Build installers

```bash
npm run build          # release bundles
npm run build:debug    # debug bundle
```

This compiles the Angular frontend with the `desktop` configuration and builds the native desktop packages.
Artifacts are emitted under `src-tauri/target/release/bundle/`:
- `docspyre-desktop.exe` — the raw executable (`src-tauri/target/release/`)
- `bundle/msi/DocSpyre_*.msi` and `bundle/nsis/DocSpyre_*-setup.exe` — Windows installers

## Customization

- App window, identifier, bundle targets: `src-tauri/tauri.conf.json`
- Native permissions (allowlist): `src-tauri/capabilities/default.json`
- Rust commands / plugins: `src-tauri/src/lib.rs`
- Frontend application source: `src/`
- Regenerate icons from a square source image: `npm run icon <path-to-image.png>`
