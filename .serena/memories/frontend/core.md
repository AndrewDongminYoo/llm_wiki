# Frontend Core (`src/`)

## Layout

- `src/App.tsx`, `src/main.tsx` — entry / root layout.
- `src/components/` — UI. `settings/` holds the LLM/provider configuration surface (`llm-presets.ts`, `preset-resolver.ts`, `sections/*-section.tsx`).
- `src/stores/` — Zustand stores. One file per concern: `chat-store`, `wiki-store`, `lint-store`, `review-store`, `research-store`, `update-store`, `activity-store`, `file-sync-store`.
- `src/lib/` — pure logic + LLM transports + filesystem helpers. ~150 files. Conventional groupings:
  - LLM dispatch: `llm-client.ts`, `llm-providers.ts`, `has-usable-llm.ts`.
  - Subprocess LLM transports: `claude-cli-transport.ts`, `codex-cli-transport.ts`. These parse the stream-json events emitted by the Rust child-process commands.
  - Ingest pipeline: `ingest.ts`, `ingest-queue.ts`, `ingest-cache.ts`, `ingest-sanitize.ts`, `ingest-parse.ts`.
  - Wiki page lifecycle: `wiki-*.ts`, `page-merge.ts`, `enrich-wikilinks.ts`.
  - Graph: `wiki-graph.ts`, `graph-*.ts` (visibility, filters, relevance, insights, search).
  - Search/dedup: `search.ts`, `search-rrf.ts`, `dedup*.ts`.
  - Embeddings/vision: `embedding.ts`, `vision-caption.ts`, `image-caption-pipeline.ts`.
- `src/commands/` — thin wrappers around Tauri `invoke()` calls (typed call sites).
- `src/i18n/` — i18next config and translation tables.
- `src/types/` — shared TS types (mirrors Rust serde structs where they cross IPC).
- `src/test-helpers/` — `load-test-env.ts` (vitest setup file).

## LLM provider model

`llm-providers.ts` enumerates provider kinds. Two transport families:

- HTTP-based (OpenAI-compatible, Azure, Anthropic API, etc.) → use `tauri-plugin-http`'s `fetch` via `tauri-fetch.ts` for CORS-bypass.
- Local CLI subprocess (`claude-code`, `codex`) → use `{claude,codex}-cli-transport.ts` to drive the Rust commands.

`has-usable-llm.ts` is the single check the rest of the app uses to decide whether to surface LLM-powered UI; if you add a provider, update it.

## State conventions

Each Zustand store exposes a hook + raw `getState()` access. Some stores persist via the `persist` middleware (`src/lib/persist.ts` wraps it for Tauri-store-backed storage). The wiki store and review store have property tests — fast-check uses `fc.assert(fc.property(...))` patterns.
