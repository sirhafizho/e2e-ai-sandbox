# Story A4.4: Wire Note Suggester on Session End

> **Sprint:** A4 — UI Feature Completion | **Priority:** P2 | **Size:** M (1-3 hours)
> **Depends on:** A1.1 (knowledge injection should be wired so notes are useful)
> **Audit ref:** P1-04 in `phase5-audit-findings.md`

## Problem

`NoteSuggester` (193 lines, `knowledge/note-suggester.ts`) analyzes conversation messages for patterns (repeated corrections, file discoveries, tool preferences, build commands) and generates suggested knowledge notes with confidence scores. It's never instantiated or called. All the pattern-recognition logic exists but produces zero value because nothing triggers it.

## What Needs to Happen

### 1. Instantiate NoteSuggester and pass it to ws-handler

In app.ts, where dependencies are created:

```typescript
const noteSuggester = new NoteSuggester(knowledgeStore);

// Pass to WebSocket handler deps:
const wsHandler = createWsHandler({
  // ... existing deps ...
  noteSuggester,
});
```

### 2. Call NoteSuggester after the agent loop completes

In ws-handler.ts, after the agent loop finishes and conversation history is saved (~line 258-270):

```typescript
// After saving history...
try {
  const suggestions = noteSuggester.suggest(
    session.history,
    session.repoScope ?? 'global'
  );

  // Auto-approve high-confidence suggestions
  for (const suggestion of suggestions) {
    if (suggestion.confidence > 0.7) {
      noteSuggester.approve(suggestion);
    }
  }

  // Emit lower-confidence suggestions to UI for user review
  const pendingSuggestions = suggestions.filter(s => s.confidence <= 0.7);
  if (pendingSuggestions.length > 0) {
    ws.send(JSON.stringify({
      type: 'note_suggestions',
      data: pendingSuggestions,
    }));
  }
} catch (err) {
  console.error('NoteSuggester failed:', err);
  // Non-fatal — don't break the session
}
```

### 3. Add noteSuggester to ws-handler deps interface

```typescript
interface WsHandlerDeps {
  // ... existing fields ...
  noteSuggester: NoteSuggester;
}
```

### 4. (Optional) Add UI notification for pending suggestions

In SessionPage.tsx, listen for the `note_suggestions` WebSocket event:

```typescript
case 'note_suggestions':
  // Show a toast or inline notification
  setSuggestedNotes(event.data);
  break;
```

This UI part can be deferred to a follow-up story if time is tight.

## Key Method Signatures

```typescript
class NoteSuggester {
  constructor(knowledgeStore: KnowledgeStore)
  suggest(messages: Message[], repoScope: string): NoteSuggestion[]
  approve(suggestion: NoteSuggestion): KnowledgeNoteRow
}

interface NoteSuggestion {
  content: string;
  tags: string[];
  confidence: number;
  source: string;  // what pattern triggered this
}
```

## Files to Modify

| File | Change |
|------|--------|
| `packages/server/src/server/app.ts` | Instantiate `NoteSuggester` with `knowledgeStore`, pass to ws-handler deps |
| `packages/server/src/server/ws-handler.ts` | Add `noteSuggester` to deps interface, call `suggest()` after agent loop completes, auto-approve high-confidence notes, emit lower-confidence suggestions via WebSocket |
| `packages/ui/src/pages/SessionPage.tsx` | (Optional) Handle `note_suggestions` WebSocket event, show toast/notification |

## Acceptance Criteria

- [ ] After a conversation ends, NoteSuggester analyzes the messages
- [ ] High-confidence notes (>0.7) are auto-created in the knowledge store
- [ ] Lower-confidence suggestions are emitted as `note_suggestions` WebSocket events (optional — can defer UI)
- [ ] Suggested notes include the repo scope from the session
- [ ] Duplicate notes are not created (NoteSuggester checks KnowledgeStore)
- [ ] NoteSuggester failures don't crash the session (wrapped in try/catch)
- [ ] Existing tests still pass

## How to Verify

1. Start the server (`pnpm dev` in packages/server)
2. Create a session and have a conversation that includes patterns NoteSuggester looks for:
   - Repeated corrections ("no, use pnpm not npm")
   - Build commands ("run `pnpm build` to compile")
   - File discoveries ("the config is in /workspace/.env")
3. After the conversation ends, check the knowledge store: `GET /api/knowledge/notes`
4. High-confidence suggestions should appear as notes
5. (If UI is wired) Check for a toast notification with lower-confidence suggestions
6. Run `pnpm test` — all existing tests pass

## Notes

- The NoteSuggester's `suggest()` method is synchronous — it does string pattern matching on conversation messages, not LLM calls. It's fast and safe to run inline.
- The 0.7 confidence threshold for auto-approval is a starting point. It can be made configurable later.
- The `approve()` method handles deduplication internally by checking the KnowledgeStore for similar existing notes.
- The `repoScope` ties notes to a specific repository. If A1.5 (repo URL in session) isn't done yet, use `'global'` as the default scope.
- This is a "fire and forget" integration — if NoteSuggester fails for any reason, the session should still complete normally.
