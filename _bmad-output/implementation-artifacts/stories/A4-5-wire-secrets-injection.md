# Story A4.5: Wire Secrets Injection into Containers

> **Sprint:** A4 — UI Feature Completion | **Priority:** P2 | **Size:** S (< 1 hour)
> **Depends on:** Nothing
> **Audit ref:** P3-27 in `phase5-audit-findings.md`

## Problem

SecretsStore has CRUD API and REST endpoints (`GET/PUT/DELETE /api/secrets/:repo/:key`). The settings UI lets users manage secrets. But secrets are never actually injected as environment variables into sandbox containers. The secrets management is purely cosmetic — users can store secrets but they have zero effect.

## What Needs to Happen

### 1. Read secrets from the store before container creation

In app.ts, in the `POST /api/sessions` handler (~line 153), before creating the container:

```typescript
// Fetch secrets to inject as environment variables
const repoScope = body.repo_url ?? 'global';
const globalSecrets = secretsStore.listSecrets('global');
const repoSecrets = repoScope !== 'global'
  ? secretsStore.listSecrets(repoScope)
  : [];

// Merge: repo-scoped secrets override global ones
const secretsMap = new Map<string, string>();
for (const s of globalSecrets) {
  secretsMap.set(s.key, s.value);
}
for (const s of repoSecrets) {
  secretsMap.set(s.key, s.value);
}

const envVars = Array.from(secretsMap.entries()).map(
  ([key, value]) => `${key}=${value}`
);
```

### 2. Pass env vars to containerManager.create()

```typescript
const containerId = await containerManager.create({
  // ... existing options ...
  env: envVars,  // ['SECRET_KEY=value', 'API_TOKEN=abc123']
});
```

### 3. Add env support to ContainerManager.create() (if missing)

Check the `CreateOptions` interface in `container-manager.ts`. If it doesn't support `env`, add it:

```typescript
interface CreateOptions {
  // ... existing fields ...
  env?: string[];  // Environment variables as 'KEY=VALUE' strings
}

// In the create() method, pass to Docker:
const container = await this.docker.createContainer({
  // ... existing config ...
  Env: options.env ?? [],
});
```

Docker's container create API natively supports `Env: ['KEY=VALUE']`, so this is straightforward.

## Files to Modify

| File | Change |
|------|--------|
| `packages/server/src/server/app.ts` | In `POST /api/sessions` handler (~line 153), read secrets from `secretsStore`, merge global + repo-scoped, pass as `env` to `containerManager.create()` |
| `packages/server/src/sandbox/container-manager.ts` | If `CreateOptions` doesn't support `env`, add it and pass to Docker's `Env` config |

## Acceptance Criteria

- [ ] Secrets stored via REST API are injected as environment variables into the sandbox container
- [ ] Secret values are available via `echo $SECRET_NAME` in the container shell
- [ ] Secrets are NOT included in the LLM system prompt (never sent to the model)
- [ ] Global secrets are always injected
- [ ] Repo-scoped secrets are injected when the session's repo matches
- [ ] Repo-scoped secrets override global secrets with the same key
- [ ] Existing tests still pass

## How to Verify

1. Start the server (`pnpm dev` in packages/server)
2. Store a secret: `PUT /api/secrets/global/MY_TOKEN` with `{ "value": "secret123" }`
3. Create a new session
4. Open the terminal and run `echo $MY_TOKEN` — should print `secret123`
5. Store a repo-scoped secret: `PUT /api/secrets/my-repo/DB_URL` with `{ "value": "postgres://..." }`
6. Create a session with `repo_url: "my-repo"` — verify both `MY_TOKEN` and `DB_URL` are available
7. Create a session without a repo — verify only `MY_TOKEN` (global) is available, not `DB_URL`
8. Run `pnpm test` — all existing tests pass

## Notes

- Secrets are injected at container creation time only. If a user adds a secret after creating a session, it won't appear in that session's container. This is expected — environment variables are set at process start.
- Secret values must NEVER be included in the LLM system prompt or sent to the model in any way. They are purely for the sandbox environment.
- The `secretsStore.listSecrets()` method should return decrypted values. Verify that the store handles encryption/decryption if applicable.
- Consider logging which secret keys (not values!) were injected, for debugging purposes: `console.log('Injected secrets:', envVars.map(e => e.split('=')[0]))`.
- Docker's `Env` field in container config is the standard way to pass environment variables — no workarounds needed.
