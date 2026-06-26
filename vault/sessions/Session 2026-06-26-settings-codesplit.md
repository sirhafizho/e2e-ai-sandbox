# Session — 2026-06-26 (Settings API + Code Splitting)

## Summary

Added server-side settings persistence, implemented code splitting for the UI, and created integration tests. All 258 tests pass (up from 246), typecheck clean, UI build clean.

## What Was Done

### 1. Server-Side Settings API
- Added v2 database migration: `settings` table (key-value store with `key TEXT PRIMARY KEY`, `value TEXT`, `updated_at TEXT`)
- Fixed migration system: fresh databases now correctly apply all migrations (v1 + v2), not just v1
- Created `SettingsStore` class with `getAll()` and `saveAll()` methods
- Added `GET /api/settings` endpoint — returns settings with API key redacted
- Added `PUT /api/settings` endpoint — saves settings, preserves real API key when client sends redacted placeholder
- Session creation now uses server settings for model, Docker image, CPU, and memory limits
- Agent loop lazy init (both REST and WebSocket) now uses server settings for provider type, base URL, and API key

### 2. Code Splitting
- **Route-level**: `SessionPage` and `SettingsPage` lazy-loaded via `React.lazy()` + `Suspense`
- **Component-level**: CodeMirror core (`@codemirror/view`, `@codemirror/state`, `@codemirror/theme-one-dark`) loaded via dynamic `import()` when first file is viewed
- **Language packs**: Each CodeMirror language (JS, TS, Python, JSON, HTML, CSS, Markdown) loaded on-demand via dynamic `import()`
- **Result**: Initial bundle **278KB** (was ~1456KB). SessionPage chunk **659KB** loaded only when user enters a session. SettingsPage chunk **7KB**.

### 3. UI Settings Page Upgrade
- Settings now load from server API on mount (was localStorage)
- Save button calls `PUT /api/settings` (was `localStorage.setItem`)
- Loading state with spinner while fetching settings
- Async save with saving/saved/error states

### 4. Integration Tests
- `settings-store.test.ts` — 7 tests: defaults, save/retrieve provider, save/retrieve docker, save both, partial updates, return value, persistence across SettingsStore instances
- `settings-api.test.ts` — 5 tests: default settings on fresh DB, save + redact API key, persistence across GETs, API key redaction protection, independent docker updates
- Updated `database.test.ts` — schema version assertions updated to v2, added settings table check

## Test Coverage
- **258 tests total** (was 246), all passing
- Shared typecheck: clean
- Server typecheck: clean
- UI typecheck: clean
- UI build: clean (code-split output)

## Files Modified

| File | Change |
|------|--------|
| `packages/server/src/db/database.ts` | v2 migration (settings table), fixed migration ordering |
| `packages/server/src/db/settings-store.ts` | **NEW** — SettingsStore class |
| `packages/server/src/db/index.ts` | Export SettingsStore |
| `packages/server/src/index.ts` | Export SettingsStore from package |
| `packages/server/src/server/app.ts` | Settings API endpoints, wire settings to session creation + agent loop |
| `packages/server/src/server/ws-handler.ts` | Accept settingsStore in deps, use for provider config |
| `packages/server/src/db/__tests__/database.test.ts` | Updated for v2 schema |
| `packages/server/src/db/__tests__/settings-store.test.ts` | **NEW** — 7 unit tests |
| `packages/server/src/server/__tests__/settings-api.test.ts` | **NEW** — 5 integration tests |
| `packages/ui/src/App.tsx` | Route-level code splitting with lazy/Suspense |
| `packages/ui/src/components/files/FilePanel.tsx` | Dynamic import of CodeMirror modules |
| `packages/ui/src/lib/api.ts` | Settings API client + types |
| `packages/ui/src/pages/SettingsPage.tsx` | Server-backed settings, loading/saving states |

## Next Steps

1. **Code splitting SessionPage further** — consider lazy-loading TerminalPanel and BrowserPanel independently
2. **Phase 4 planning** — Knowledge & Intelligence system (SQLite knowledge notes, rules loading, session history, repo map)
3. **Error boundaries** — add React error boundaries around lazy-loaded components
4. **Settings validation** — Zod schema validation on the settings API endpoint

## BMAD State
- **Phase 2**: COMPLETE (13/13 stories)
- **Phase 3**: COMPLETE (UI + integration + polish + settings + code splitting)
- **Phase position**: Ready for Phase 4 planning
