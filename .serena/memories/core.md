# Project Core

Personal LLM-driven knowledge base. Tauri 2 desktop app: React/TS webview + Rust backend. Ingests user documents → builds + maintains a wiki, with graph view, semantic search (LanceDB), and pluggable LLM providers (HTTP + local subprocesses `claude`, `codex`).

## Top-level invariants

- Two-process model: Vite dev server on `:1420` (strictPort), Rust webview shell launches it via `tauri.conf.json::beforeDevCommand`.
- Frontend ↔ Rust IPC = `@tauri-apps/api/core` `invoke()` for unary calls, Tauri events for streaming. Stream channel topic = `<provider>-cli:{stream_id}` with a paired `:done` epilogue.
- All Tauri commands wrap their work in `panic_guard::run_guarded("<name>", || ...)`. Release profile uses `panic = "unwind"` so third-party parser panics (pdfium, calamine, docx-rs) become command-boundary errors instead of process kills.
- LanceDB is embedded — no external DB process. Vector store lives under app data dir.
- pdfium dynamic library resolved at runtime via `app.path().resource_dir()` in `lib.rs::run` setup. Not on PATH.
- Two long-running services start in `lib.rs::run`: `clip_server` (clipboard daemon) and `api_server` (HTTP, port from store). Both are panic-isolated.

## Read next

- Frontend module map: `mem:frontend/core`
- Rust backend module map: `mem:backend/core`
- Stack/versions: `mem:tech_stack`
- Dev/build/test commands: `mem:suggested_commands`
- Cross-cutting code conventions: `mem:conventions`
- What "done" means for a task: `mem:task_completion`
