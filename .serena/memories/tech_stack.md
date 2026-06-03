# Tech Stack

## Frontend (`src/`)

- React 19 + TS 5.7, Vite 8, Tailwind 4 (`@tailwindcss/vite` plugin).
- UI: shadcn (`shadcn` 4.x + base-ui), `lucide-react`, `react-resizable-panels`.
- State: Zustand 5 (one store per concern under `src/stores/`).
- Editor: Milkdown 7 (`@milkdown/*`), KaTeX, remark-math, mermaid.
- Graph: `sigma` 3 + `graphology` (+ louvain communities, forceatlas2).
- i18n: `i18next` + `react-i18next`. UI strings under `src/i18n/`.
- Tests: Vitest 4 + `fast-check` for property tests. `node` environment.

## Backend (`src-tauri/`)

- Rust 2021. Tauri 2 (`tauri = "2"`, features `protocol-asset`).
- Async runtime: tokio 1 (features `process, io-util, sync, macros, rt`). Provided transitively by Tauri.
- HTTP out: `reqwest 0.12` with `rustls-tls` (no system OpenSSL). Also `tauri-plugin-http` with `unsafe-headers` feature so LLM endpoints that reject browser-origin headers can be reached from the webview.
- Vector store: `lancedb 0.27` + `arrow-array`/`arrow-schema 57`.
- Doc parsers: `pdfium-render 0.9` (PDF), `calamine 0.34` (xlsx), `docx-rs 0.4.20` + `office_oxide =0.1.2` (docx).
- Subprocess transports for local LLM CLIs use `tokio::process` + the `which` crate (v7) for binary discovery (extended by `find_claude_command` to scan launchd-invisible Homebrew/bun/pnpm paths and shell fallback).
- Filesystem: `notify 8` for watchers, `walkdir 2`, `zip 2`.
- Crypto/hashing: `sha2`, `md-5` for dedup.

## Tauri plugins

`tauri-plugin-opener`, `-dialog`, `-store`, `-http`. No `-shell` — see `mem:conventions` for why subprocess transports use `tokio::process` directly.

## Package management

Lockfile is `package-lock.json` (npm), but the `tauri` script is invoked equivalently via `pnpm tauri ...` in dev workflows. Frontend version is the single source of truth (`pkgJson.version` → `__APP_VERSION__` Vite define).
