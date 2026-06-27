# Story A1.5: Accept repo_url in Session Creation

> **Sprint:** A1 — Critical Wiring | **Priority:** P0 | **Size:** M (1-3 hours)
> **Depends on:** Nothing (but A1.2 benefits from this — repo maps are more useful with real repos)
> **Audit ref:** P0-12 in `phase5-audit-findings.md`

## Problem

`POST /api/sessions` only accepts `{ model }`. The spec requires `repo_url`, `snapshot_id`, and `environment_yaml` parameters. Without `repo_url`, every session starts with an empty `/workspace` — you can't test brownfield workflows (clone, explore, fix bugs in existing repos).

## What Needs to Happen

### 1. Accept `repo_url` in the request body

In `app.ts`, the POST /api/sessions handler (~line 146), extend the body parsing:

```typescript
const body = await c.req.json().catch(() => ({}));
const { model, repo_url, branch } = body as { 
  model?: string; 
  repo_url?: string;
  branch?: string;
};
```

### 2. After container health check, clone the repo

After the health check passes (~line 161) and before returning the response:

```typescript
if (repo_url) {
  const cloneCmd = branch 
    ? `cd /workspace && git clone --branch ${branch} --single-branch ${repo_url} .`
    : `cd /workspace && git clone ${repo_url} .`;
  
  const cloneResult = await containerManager.exec(containerInfo.containerId, cloneCmd, {
    timeoutMs: 120_000, // 2 min timeout for large repos
  });
  
  if (cloneResult.exitCode !== 0) {
    await containerManager.destroy(containerInfo.containerId);
    return c.json({
      error: {
        code: 'CONTAINER_ERROR',
        message: `Failed to clone repo: ${cloneResult.stderr.trim()}`,
      },
    }, 500);
  }
}
```

### 3. Store repo info in session state

Add `repo` to the in-memory `SessionState` and to the database:

```typescript
const session: SessionState = {
  id: sessionId,
  containerId: containerInfo.containerId,
  model,
  status: 'ready',
  createdAt: dbRow.created_at,
  volumeName: containerInfo.volumeName,
  repo: repo_url ?? null,  // <-- NEW
};
```

### 4. Pass repo to knowledge injection (ties into A1.1)

When knowledge injection is wired (A1.1), use `session.repo` as the repo parameter:

```typescript
const knowledgeContext = await knowledgeInjector.inject(
  session.containerId,
  session.repo,      // <-- NOW AVAILABLE
  taskKeywords,
);
```

### 5. Update the UI session creation form

In `SessionsPage.tsx`, the "Create Session" form should include a repo URL input field. The current form likely only has a model selector.

### 6. Trigger repo map generation after clone (ties into A1.2)

After successful clone, if A1.2 is implemented, trigger repo map generation:

```typescript
if (repo_url) {
  // Clone...
  // Then generate repo map
  repoMapGenerator.generate(
    containerInfo.containerId,
    containerManager,
    '/workspace',
    repoMapStore,
    repo_url,  // Use repo URL as cache key
  ).catch(err => console.warn('Repo map generation failed:', err));
}
```

## Files to Modify

| File | Change |
|------|--------|
| `packages/server/src/server/app.ts` | Accept `repo_url` and `branch` in POST /api/sessions, clone after health check |
| `packages/server/src/server/app.ts` | Add `repo` field to `SessionState` type |
| `packages/ui/src/pages/SessionsPage.tsx` | Add repo URL input to session creation form |
| `packages/ui/src/lib/api.ts` | Update `createSession()` to accept `repo_url` parameter |

## Acceptance Criteria

- [ ] `POST /api/sessions` accepts `repo_url` and optional `branch` in the request body
- [ ] When `repo_url` is provided, the repo is cloned into `/workspace` before the session becomes ready
- [ ] Clone failure returns a clear error and destroys the container (no orphaned containers)
- [ ] Private repos work if the container has git credentials configured
- [ ] Sessions without `repo_url` still work (blank workspace, same as today)
- [ ] The UI has a text input for repo URL in the session creation form
- [ ] Existing tests still pass

## How to Verify

1. Create a session with: `POST /api/sessions { "repo_url": "https://github.com/expressjs/express" }`
2. Connect to the session and run `ls /workspace` — should show the Express repo files
3. The file panel should show the cloned repo structure
4. Create a session without `repo_url` — should work as before (empty workspace)

## Notes

- Git clone can be slow for large repos. Consider adding progress streaming (WebSocket event) in a follow-up.
- For private repos, the container needs git credentials. The Forge base image includes `gh` CLI. If `GITHUB_TOKEN` is set in secrets (via SecretsStore), it could be injected as an env var. This ties into story A4.5 (secrets injection).
- `snapshot_id` and `environment_yaml` support are separate features — don't implement them here.
- The clone uses `--single-branch` for faster cloning when a branch is specified.
