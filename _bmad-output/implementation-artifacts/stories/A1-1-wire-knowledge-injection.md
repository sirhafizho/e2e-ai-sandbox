# Story A1.1: Wire Knowledge Injection into Agent Loop

> **Sprint:** A1 — Critical Wiring | **Priority:** P0 | **Size:** M (1-3 hours)
> **Depends on:** Nothing (first story)
> **Audit ref:** P0-01 in `phase5-audit-findings.md`

## Problem

`KnowledgeInjector` is instantiated in `app.ts:76-81` with all its dependencies (knowledgeStore, sessionHistoryStore, repoMapStore, containerManager), but `.gather()` / `.inject()` are **never called**. The agent's system prompt has no access to:

- Workspace rules (AGENTS.md, CLAUDE.md, .cursorrules)
- Knowledge notes from the database
- Previous session summaries
- Repository structure maps

The `buildSystemPrompt()` in `system-prompt.ts` accepts an optional `knowledgeContext?: string` parameter, but it's never populated.

## What Needs to Happen

### 1. Pass `knowledgeInjector` to the agent loop invocation sites

There are **two places** where the agent loop runs:

**REST endpoint** — `app.ts` around line 471:
```typescript
for await (const event of session.agentLoop.run(content, {
  sessionId: session.id,
  containerId: session.containerId,
  model: session.model,
})) {
```

**WebSocket handler** — `ws-handler.ts` around line 120:
```typescript
for await (const agentEvent of session.agentLoop.run(parsed.content, {
  sessionId: session.id,
  containerId: session.containerId,
  model: session.model,
}, { abortSignal: abortController.signal })) {
```

### 2. Before calling `agentLoop.run()`, call `knowledgeInjector.inject()`

```typescript
const knowledgeContext = await knowledgeInjector.inject(
  session.containerId,
  null,          // repo — extracted later in A1.2/A1.5
  []             // taskKeywords — simple word extraction from user message
);
```

### 3. Pass the result via `SessionContext.systemPrompt`

The `SessionContext` interface in `types.ts:3-8` already has `systemPrompt?: string`. Use it:

```typescript
const systemPrompt = buildSystemPrompt({
  toolNames: toolSpecs.map(t => t.name),
  sessionId: session.id,
  knowledgeContext,
});

session.agentLoop.run(content, {
  sessionId: session.id,
  containerId: session.containerId,
  model: session.model,
  systemPrompt,  // <-- NOW POPULATED
});
```

**BUT** there's a design issue: `buildSystemPrompt()` is called inside `agent-loop.ts:162-165`, not at the call site. Two options:

**Option A (simpler):** Build the system prompt at the call site and pass via `SessionContext.systemPrompt`. The agent loop already checks for this (line 161: `sessionContext.systemPrompt ?? buildSystemPrompt({...})`).

**Option B (cleaner):** Pass `knowledgeInjector` as a dependency to `AgentLoop` and let it call inject internally. This requires modifying `AgentLoopOptions`.

**Recommended: Option A** — less invasive, keeps knowledge injection at the server layer.

## Files to Modify

| File | Change |
|------|--------|
| `packages/server/src/server/app.ts` | Before `agentLoop.run()` in POST /api/sessions/:id/messages (~line 471), call `knowledgeInjector.inject()` and build system prompt |
| `packages/server/src/server/ws-handler.ts` | Same change in the WebSocket user_message handler (~line 120). `knowledgeInjector` needs to be passed via `deps` |
| `packages/server/src/server/ws-handler.ts` | Add `knowledgeInjector` to the `deps` parameter of `createWsHandler()` |
| `packages/server/src/agent/system-prompt.ts` | No changes needed — already accepts `knowledgeContext` |

## Acceptance Criteria

- [ ] When the agent processes a message, rules from AGENTS.md (if present in workspace) appear in the system prompt
- [ ] Knowledge notes stored in the database are injected into the system prompt
- [ ] Session history summaries (if any exist for this repo) are injected
- [ ] Repo map data (if populated) is injected
- [ ] If no knowledge exists, the system prompt works exactly as before (graceful fallback)
- [ ] Existing tests still pass (`pnpm test`)

## How to Verify

1. Start the server (`pnpm dev` in packages/server)
2. Create a session
3. Create a knowledge note via REST: `POST /api/knowledge/notes` with `{ "content": "Always use pnpm", "tags": ["workflow"] }`
4. Send a message to the agent: "Install dependencies"
5. Check server logs — the system prompt should include the knowledge note
6. (Optional) Create an AGENTS.md in the container workspace, verify it appears in the prompt

## Notes

- The `knowledgeInjector.inject()` call is async and does I/O (reads files from container, queries DB). It should be called ONCE before the agent loop starts, not on every turn.
- For now, pass `repo: null` and `taskKeywords: []`. Story A1.5 will add repo_url support, and keyword extraction can be a follow-up.
- The `inject()` method returns an empty string if no knowledge is found, so it's safe to always call it.
