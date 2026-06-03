# Conventions

## Rust commands (Tauri)

- Every `#[tauri::command]` body wraps work in `panic_guard::run_guarded("<name>", || { ... })`. The closure returns `Result<T, E>`; on panic, `run_guarded` converts it to an `Err` so a single corrupt file can't crash the process. Release profile is `panic = "unwind"` for this reason — do not switch to `abort`.
- Commands that own per-instance state (e.g. running child processes) hold it in a `#[derive(Default)] struct ...State { ... }` registered with `app.manage(...)` in `lib.rs::run` setup, and accessed via `State<'_, FooState>` in command signatures.
- Streaming results: spawn child / async task; emit one Tauri event per line on topic `"<provider>-cli:{stream_id}"`; emit a final `"<provider>-cli:{stream_id}:done"` event with `{ code, stderr }`. Frontend listens via `@tauri-apps/api/event::listen`.
- Subprocess transports use `tokio::process::Command` directly, not `tauri-plugin-shell`. Rationale: plugin's scope model assumes sidecars or fixed absolute paths; user-installed PATH binaries are awkward. Hardcoded `Command::new(<resolved>)` gives equivalent security (webview cannot redirect the spawned program) without extra capabilities JSON.

## Frontend ↔ Rust IPC

- Unary calls: `import { invoke } from "@tauri-apps/api/core"`, then `invoke<T>("snake_case_command_name", { camelCaseArgs })`. Rust side declares args in snake_case; Tauri auto-converts.
- Streaming: pass a frontend-generated `streamId` to the spawn command; subscribe to `<provider>-cli:{streamId}` and `:done` topics; call the corresponding `*_kill` command on `AbortSignal`.

## Tests

- Naming: `foo.test.ts` for mocked unit tests, `foo.scenarios.test.ts` for scenario tables, `foo.property.test.ts` for fast-check, `foo.integration.test.ts` for cross-module mocked, `foo.real-llm.test.ts` for live-network real-LLM (excluded from default `test:mocks`).
- Real-LLM tests load env via `src/test-helpers/load-test-env.ts` (`.env.test.local`). Setup file is configured in `vite.config.ts::test.setupFiles`, so the loader runs whether or not the file exists.
- Vitest env is `node`, not `jsdom`. DOM-heavy components are tested by extracting logic to a pure module.

## Versioning

- `package.json::version` is canonical. `vite.config.ts` reads it at config-load and defines `__APP_VERSION__` so the UI can render it without duplication.
- `src-tauri/Cargo.toml::version` and `src-tauri/tauri.conf.json::version` must be kept in sync with `package.json`. The release commit (e.g. `b86d81b`) bumps all three but historically has missed regenerating `Cargo.lock` — verify lockfile after bumping.

## Commit messages

Conventional commits: `feat:`, `fix:`, `chore:`, `docs:`, `perf:`, `release:`. Scopes used in recent history: `(claude-cli)`, `(readme)`. Bodies explain rationale and reference prior commits by short SHA when relevant.
