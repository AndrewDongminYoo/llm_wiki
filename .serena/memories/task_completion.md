# Task Completion Checklist

Run these before declaring a coding task done. Order matters — typecheck first because it's the fastest signal.

## Always

1. `npm run typecheck` — TS strict check via `tsc --build`. Fails fast on any frontend type drift.
2. `cd src-tauri && cargo check` — full Rust type/borrow check. Required even for changes that look frontend-only if they touch IPC payload shapes (Tauri serde derives mirror frontend types).
3. `npm run test:mocks` — full mocked vitest suite. Real-LLM tests excluded by glob.

## When the change touches a real-LLM code path

Additionally:

- `npm run test:llm` — requires `.env.test.local` + network. Skip in CI unless explicitly gated.

## When the change touches Tauri commands or `lib.rs` setup

Additionally:

- `pnpm tauri dev` and exercise the affected flow end-to-end at least once. The mocked suite cannot catch panic-guard regressions, plugin registration ordering, or stream-event topic mismatches.

## Do NOT skip

- Never claim a Rust change is verified by `cargo check` alone if it touched `unsafe` boundaries, panic_guard usage, or release-profile-only behavior — `cargo check --release` or `cargo build --release` may surface different warnings.
- Never skip typecheck for "small" TS edits: Tauri command argument renames cascade silently through `invoke()` call sites in this codebase.
