# Story A4.1: Add File Write REST Endpoint + Enable Editor

> **Sprint:** A4 — UI Feature Completion | **Priority:** P1 | **Size:** M (1-3 hours)
> **Depends on:** Nothing
> **Audit ref:** P1-18 in `phase5-audit-findings.md`

## Problem

The file panel in the UI uses CodeMirror 6 but is set to `readOnly` (FilePanel.tsx line 136-137: `EV.editable.of(false)` and `ES.readOnly.of(true)`). There is no REST endpoint for writing files — only `GET /api/sessions/:id/files` exists for listing/reading. Users can't edit files through the UI.

## What Needs to Happen

### 1. Add a new endpoint in app.ts for writing files

Add `PUT /api/sessions/:id/files/write` that accepts `{ path: string, content: string }` and writes the file to the container via `containerManager.exec()` (same approach as the `file_write` tool handler):

```typescript
app.put('/api/sessions/:id/files/write', async (c) => {
  const sessionId = c.req.param('id');
  const session = sessions.get(sessionId);
  if (!session) return c.json({ error: 'Session not found' }, 404);

  const { path, content } = await c.req.json();

  // Path traversal protection
  if (!path.startsWith('/workspace') || path.includes('..')) {
    return c.json({ error: 'Path must be within /workspace' }, 400);
  }

  await containerManager.exec(session.containerId, [
    'sh', '-c', `cat > ${path} << 'FORGE_EOF'\n${content}\nFORGE_EOF`
  ]);

  return c.json({ success: true, path });
});
```

### 2. Make the CodeMirror editor editable

In FilePanel.tsx, remove the readOnly and editable restrictions:

```typescript
// BEFORE (line 136-137):
EV.editable.of(false),
ES.readOnly.of(true),

// AFTER: Remove both lines (or set to true)
EV.editable.of(true),
```

### 3. Add a Save button that writes content back

```typescript
const handleSave = async () => {
  if (!selectedFile || !editorView) return;
  const content = editorView.state.doc.toString();
  await api.writeFile(sessionId, selectedFile.path, content);
  setModified(false);
};
```

### 4. Add visual indicator for unsaved changes

Track modifications via CodeMirror's `updateListener`:

```typescript
const [modified, setModified] = useState(false);

// In CodeMirror extensions:
EV.updateListener.of((update) => {
  if (update.docChanged) setModified(true);
});
```

Display a dot or "Modified" badge on the file tab when `modified` is true.

### 5. Add keyboard shortcut Cmd/Ctrl+S to save

```typescript
const saveKeymap = keymap.of([{
  key: 'Mod-s',
  run: () => { handleSave(); return true; },
}]);
```

### 6. Add the API method

In api.ts, add:

```typescript
async writeFile(sessionId: string, path: string, content: string) {
  const res = await fetch(`${BASE}/api/sessions/${sessionId}/files/write`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path, content }),
  });
  return res.json();
}
```

## Files to Modify

| File | Change |
|------|--------|
| `packages/server/src/server/app.ts` | Add `PUT /api/sessions/:id/files/write` endpoint with path traversal protection |
| `packages/ui/src/components/files/FilePanel.tsx` | Remove readOnly/editable restrictions, add Save button, modified indicator, Cmd/Ctrl+S shortcut |
| `packages/ui/src/lib/api.ts` | Add `writeFile()` method |

## Acceptance Criteria

- [ ] `PUT /api/sessions/:id/files/write` creates/overwrites a file in the container
- [ ] File panel editor is editable (users can type)
- [ ] Save button writes content back to container
- [ ] Cmd/Ctrl+S saves the file
- [ ] Unsaved changes are visually indicated
- [ ] Path traversal protection (reject paths outside /workspace)
- [ ] Existing tests still pass

## How to Verify

1. Start the server (`pnpm dev` in packages/server)
2. Create a session and open a file in the file panel
3. Type in the editor — verify the editor accepts input
4. Check for a visual "Modified" indicator
5. Click Save (or press Cmd+S) — verify the file is written
6. Re-read the file via `GET /api/sessions/:id/files?path=/workspace/file` — confirm content matches
7. Try writing to a path outside `/workspace` — should get 400 error
8. Run `pnpm test` — all existing tests pass

## Notes

- The heredoc approach (`cat > file << 'EOF'`) handles most content but may break if the content contains the exact string `FORGE_EOF`. Consider using base64 encoding for robustness: `echo <base64> | base64 -d > file`.
- The Save button should be disabled when there are no unsaved changes.
- Consider debouncing the modified state to avoid excessive re-renders on every keystroke.
- This story does NOT add multi-file tabs or a file tree editor — it just makes the existing single-file view editable.
