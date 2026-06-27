# Story A4.3: Fix Session List Missing Fields

> **Sprint:** A4 — UI Feature Completion | **Priority:** P2 | **Size:** S (< 1 hour)
> **Depends on:** Nothing
> **Audit ref:** P2-15 in `phase5-audit-findings.md`

## Problem

The UI (SessionsPage.tsx:110) tries to parse `session.history_json` to count messages. The API (api.ts:3-12) declares `SessionInfo` with `history_json: string` and `context_summary: string | null`. But the server's `GET /api/sessions` response (app.ts:213-227) doesn't include these fields. The session cards in the UI show broken/missing message counts because the data is never returned.

## What Needs to Happen

### 1. Add message_count to the GET /api/sessions response

In app.ts, in the `GET /api/sessions` handler (~line 213), compute and return the message count server-side. This is more efficient than sending the full `history_json` to the client:

```typescript
app.get('/api/sessions', async (c) => {
  const sessions = sessionStore.listSessions();
  const enriched = sessions.map(session => {
    let messageCount = 0;
    if (session.history_json) {
      try {
        const history = JSON.parse(session.history_json);
        messageCount = Array.isArray(history) ? history.length : 0;
      } catch { /* ignore parse errors */ }
    }
    return {
      ...session,
      message_count: messageCount,
      context_summary: session.context_summary ?? null,
      // Don't send full history_json — too large for a list endpoint
      history_json: undefined,
    };
  });
  return c.json(enriched);
});
```

### 2. Update the UI SessionInfo type (if needed)

If the UI type expects `history_json`, update it to use `message_count` instead:

```typescript
// In api.ts — update SessionInfo:
export interface SessionInfo {
  id: string;
  status: string;
  created_at: string;
  message_count: number;
  context_summary: string | null;
  // ... other fields
}
```

### 3. Update SessionsPage to use message_count

```typescript
// BEFORE (SessionsPage.tsx:110):
const messages = JSON.parse(session.history_json || '[]');
const count = messages.length;

// AFTER:
const count = session.message_count ?? 0;
```

## Files to Modify

| File | Change |
|------|--------|
| `packages/server/src/server/app.ts` | In `GET /api/sessions` handler (~line 213), add `message_count` to each session object and `context_summary` |
| `packages/ui/src/lib/api.ts` | Update `SessionInfo` interface to include `message_count: number` |
| `packages/ui/src/pages/SessionsPage.tsx` | Use `session.message_count` instead of parsing `history_json` |

## Acceptance Criteria

- [ ] `GET /api/sessions` returns `message_count` for each session
- [ ] Session cards in the UI display message counts correctly
- [ ] Empty sessions show 0 messages
- [ ] The full `history_json` is NOT sent in the list response (bandwidth optimization)
- [ ] Existing tests still pass

## How to Verify

1. Start the server (`pnpm dev` in packages/server)
2. Create a few sessions, send some messages in at least one
3. Call `GET /api/sessions` directly — verify each session has `message_count`
4. Open the sessions page in the UI — verify message counts appear on session cards
5. Create a brand new session (no messages) — verify it shows 0
6. Run `pnpm test` — all existing tests pass

## Notes

- Returning `message_count` instead of `history_json` is a deliberate bandwidth optimization. A session with hundreds of messages would have a very large `history_json` string — unnecessary for a list view.
- The `context_summary` field is useful for displaying a one-line summary on session cards (e.g., "Working on API refactoring"). Include it if the SessionStore has it.
- This is a simple data-plumbing fix — the hardest part is making sure the SessionStore's `listSessions()` actually returns the `history_json` column from SQLite so we can count it server-side.
