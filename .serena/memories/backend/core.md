# Backend Core (`src-tauri/`)

## Cargo identity

- Package: `llm-wiki` v from `Cargo.toml`.
- Library crate name: `llm_wiki_lib` (underscored), crate types `staticlib, cdylib, rlib`. Tauri 2 mobile compatibility — do not rename without testing iOS/Android stubs.
- Binary: `llm-wiki` (dashed). Entry: `src/main.rs` → `llm_wiki_lib::run()`.

## Module map

- `lib.rs::run()` — Tauri builder. Registers plugins (`opener`, `dialog`, `store`, `http`), starts `clip_server` and `api_server`, mounts shared state (`ClaudeCliState`, `CodexCliState`, `FileSyncState`), registers commands via `tauri::generate_handler![...]`.
- `panic_guard.rs` — `run_guarded(name, closure)` catches panics inside a command and returns them as `Err`. Wraps every command.
- `proxy.rs` — reads `proxyConfig` from the Tauri store and sets `HTTP_PROXY`/`HTTPS_PROXY`/`NO_PROXY` env vars. `set_proxy_env` command re-applies live (reqwest re-reads per-request via `auto_sys_proxy`).
- `api_server.rs` — embedded HTTP server (`tiny_http`) so external integrations / browser extensions can talk to the app. Port comes from the store.
- `clip_server.rs` — background clipboard daemon.
- `types/` — serde structs shared across commands.
- `commands/`:
  - `claude_cli.rs` — spawn local `claude` binary, stream JSON events back. `find_claude_command` handles macOS GUI launch PATH gap (Homebrew/bun/pnpm/npm-global candidates + `$SHELL -ilc` fallback with 2s timeout).
  - `codex_cli.rs` — analogous to claude_cli for the `codex` binary.
  - `fs.rs` — file/dir CRUD, content extraction dispatch (delegates to pdfium/calamine/docx-rs).
  - `extract_images.rs` — PDF page → PNG via pdfium-render + `image` crate. Hashes via `sha2` for dedup. base64 over IPC.
  - `vectorstore.rs` — LanceDB tables for embeddings + semantic search.
  - `search.rs` — full-text / RRF search across project files.
  - `project.rs` — project create/open lifecycle.
  - `file_sync.rs` — `notify` watcher state + change events to the frontend.

## Cross-cutting

- pdfium dynamic lib path = `app.path().resource_dir()`, fed into `commands::fs::set_resource_dir_hint()` during setup. Required before any PDF call.
- `tauri-plugin-http` uses `unsafe-headers` so LLM providers that reject browser-origin headers (MiniMax, Ark, etc.) still work via Rust-side fetch.

## See also

- IPC stream-event topic shape and `run_guarded` requirement: `mem:conventions`.
- Frontend transports that consume these commands' events: `mem:frontend/core`.
