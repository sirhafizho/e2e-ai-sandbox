# Story A1.2: Wire Repo Map Generation on Session Creation

> **Sprint:** A1 — Critical Wiring | **Priority:** P0 | **Size:** M (1-3 hours)
> **Depends on:** A1.1 (knowledge injection must be wired for repo maps to reach the LLM)
> **Audit ref:** P0-02 in `phase5-audit-findings.md`

## Problem

`RepoMapGenerator` (289 lines, in `knowledge/repo-map-generator.ts`) is fully built with tests but **never instantiated** in production. `RepoMapStore` is instantiated in `app.ts:71` but is **never populated** — the table is always empty.

When `KnowledgeInjector.gatherRepoMap()` runs (after A1.1 wiring), it reads from `RepoMapStore` and gets nothing. The agent never sees the codebase structure.

## What Needs to Happen

### 1. Instantiate RepoMapGenerator in app.ts

After the stores are created (~line 84), add:
```typescript
const repoMapGenerator = new RepoMapGenerator();
```

Import: `import { RepoMapGenerator } from '../knowledge/repo-map-generator.js';`

### 2. Generate repo map after container health check passes

In `POST /api/sessions` (~line 161), after health check passes and before returning:

```typescript
// After health check passes, generate repo map in background
// Don't block session creation — fire and forget
containerManager.exec(containerInfo.containerId, 'ls /workspace').then(async (lsResult) => {
  // Only generate if workspace has files (not empty)
  if (lsResult.stdout.trim().length > 0) {
    try {
      await repoMapGenerator.generate(
        containerInfo.containerId,
        containerManager,
        '/workspace',
        repoMapStore,
        sessionId, // use session ID as repo identifier for now
      );
    } catch (err) {
      console.warn('Repo map generation failed (non-fatal):', err);
    }
  }
});
```

### 3. Also generate on session resume if map is stale

In `POST /api/sessions/:id/resume` (~line 509), after container is resumed, check staleness and regenerate if needed.

## Files to Modify

| File | Change |
|------|--------|
| `packages/server/src/server/app.ts` | Import `RepoMapGenerator`, instantiate it, call `.generate()` after health check in POST /api/sessions |
| `packages/server/src/server/app.ts` | Optionally regenerate on session resume |

## Key Method Signatures (from repo-map-generator.ts)

```typescript
class RepoMapGenerator {
  async generate(
    containerId: string,
    containerManager: ContainerManager,
    workspacePath: string,
    store: RepoMapStore,
    repoId: string,
  ): Promise<RepoMapData>
}
```

The `generate()` method:
1. Runs `find` to list files (max 500, depth 4)
2. Builds a tree structure
3. Extracts key exports via regex on first 50 source files
4. Computes SHA-256 hashes for staleness
5. Saves to `RepoMapStore`

## Acceptance Criteria

- [ ] When a session is created with files in `/workspace`, a repo map is generated and stored
- [ ] When `KnowledgeInjector.gatherRepoMap()` runs, it returns the cached map
- [ ] Repo map generation failure does NOT block session creation (fire-and-forget)
- [ ] Empty workspaces skip repo map generation
- [ ] Existing tests still pass

## How to Verify

1. Start server, create a session
2. In the terminal, create some files: `mkdir -p /workspace/src && echo 'export function hello() {}' > /workspace/src/index.ts`
3. Check the database: the `repo_maps` table should have an entry
4. Send a message — the system prompt should include "Repository Structure" section (requires A1.1)

## Notes

- Repo map generation runs `find` and `grep` inside the container, which takes a few seconds. Don't block the session creation response — run it in background.
- For blank workspace sessions (no repo cloned), the workspace will be empty at creation time. The map will be useless. It could be regenerated after the first file operations. This is a follow-up optimization.
- The `repoId` parameter is used as the cache key. For now, use `sessionId`. When A1.5 adds repo_url support, use the repo URL instead.
