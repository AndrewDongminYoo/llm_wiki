# Suggested Commands

All commands run from project root unless noted.

## Dev / build

- `pnpm tauri dev` — full app (Vite on `:1420` + Rust webview). `beforeDevCommand` is `npm run dev`, so npm or pnpm both work.
- `npm run dev` — webview-only (no Rust). For pure-UI work that doesn't call `invoke`.
- `pnpm tauri build` — release `.app`/`.dmg` under `src-tauri/target/release/bundle/`.

## Type / lint

- `npm run typecheck` — `tsc --build --pretty`. No separate ESLint script; relies on TS strict.
- `cd src-tauri && cargo check` — Rust type/borrow check. Cheaper than full build.

## Tests

- `npm run test` — runs mocked then real-LLM. Real-LLM phase needs `.env.test.local` and network.
- `npm run test:mocks` — fast suite (`vitest run --exclude='**/*.real-llm.test.ts'`). Default for CI / local iteration.
- `npm run test:llm` — only `*.real-llm.test.ts`, serialized (`--no-file-parallelism`), verbose reporter.

## Darwin-specific notes

- macOS GUI launches (Finder, `open Foo.app`, Dock) inherit only `launchd`'s minimal PATH. Tools that depend on user-shell PATH (e.g. local `claude` binary) must scan well-known dirs or use `$SHELL -ilc 'command -v <bin>'`. See `find_claude_command` in `src-tauri/src/commands/claude_cli.rs`.
- `pnpm tauri build` produces unsigned bundles by default — Gatekeeper may quarantine on first launch. `xattr -d com.apple.quarantine path/to.app` if needed.

## Git

Standard. Conventional commits — see `mem:conventions`.
