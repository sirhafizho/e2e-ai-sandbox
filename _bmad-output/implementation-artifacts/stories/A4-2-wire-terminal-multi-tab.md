# Story A4.2: Wire Terminal Multi-Tab Support

> **Sprint:** A4 — UI Feature Completion | **Priority:** P2 | **Size:** S (< 1 hour)
> **Depends on:** Nothing
> **Audit ref:** P2-20 in `phase5-audit-findings.md`

## Problem

The terminal panel has a "New shell tab" button that says "coming soon" (TerminalPanel.tsx:123) with no `onClick` handler. The server already supports multiple terminal connections per session via different shellIds (`/ws/sessions/:id/terminal/:shellId`). The plumbing exists — just need to wire the UI button.

## What Needs to Happen

### 1. Add state to track multiple shell tabs

```typescript
const [tabs, setTabs] = useState<string[]>(['default']);
const [activeTab, setActiveTab] = useState<string>('default');
```

### 2. Give the Plus button an onClick handler

```typescript
const handleNewTab = () => {
  const shellId = `shell-${tabs.length + 1}`;
  setTabs(prev => [...prev, shellId]);
  setActiveTab(shellId);
};

// In JSX — remove the "coming soon" title:
<button onClick={handleNewTab} title="New shell tab">
  <PlusIcon />
</button>
```

### 3. Connect each tab to its own WebSocket

When switching tabs, connect to the corresponding WebSocket:

```typescript
useEffect(() => {
  const wsUrl = `${WS_BASE}/ws/sessions/${sessionId}/terminal/${activeTab}`;
  // Connect to the WebSocket for this shellId
  // Each tab gets its own PTY on the server
}, [activeTab, sessionId]);
```

### 4. Maintain separate xterm.js instances per tab

Each tab needs its own terminal instance to preserve scrollback:

```typescript
const terminalRefs = useRef<Map<string, Terminal>>(new Map());

// When creating a new tab:
const term = new Terminal({ /* options */ });
terminalRefs.current.set(shellId, term);

// When switching tabs, attach the active terminal to the DOM:
const activeTerm = terminalRefs.current.get(activeTab);
if (activeTerm && containerRef.current) {
  activeTerm.open(containerRef.current);
}
```

### 5. Render tab bar with labels

```typescript
{tabs.map((tab) => (
  <button
    key={tab}
    className={activeTab === tab ? 'active' : ''}
    onClick={() => setActiveTab(tab)}
  >
    {tab === 'default' ? 'Shell' : tab}
  </button>
))}
```

## Files to Modify

| File | Change |
|------|--------|
| `packages/ui/src/components/terminal/TerminalPanel.tsx` | Add tab state, Plus button handler, per-tab xterm instances, tab switching logic, remove "coming soon" text |

## Acceptance Criteria

- [ ] Clicking "+" creates a new terminal tab with a unique shellId
- [ ] Each tab connects to a separate WebSocket PTY
- [ ] Switching tabs shows the correct terminal output
- [ ] Tabs are labeled (Shell, shell-2, shell-3, etc.)
- [ ] The default tab still works as before
- [ ] Existing tests still pass

## How to Verify

1. Start the server (`pnpm dev` in packages/server)
2. Create a session and open the terminal panel
3. Verify the default shell tab works normally
4. Click the "+" button — a new tab appears
5. Type `echo hello` in the new tab — output appears in that tab only
6. Switch back to the default tab — its output is preserved
7. Create a third tab — verify it also works independently
8. Run `pnpm test` — all existing tests pass

## Notes

- The server already handles multiple shellIds per session — no server-side changes are needed.
- Consider adding a close (×) button on tabs (except the default tab) as a follow-up.
- Memory consideration: each xterm.js instance holds its own scrollback buffer. For sessions with many tabs, this could use significant memory. Consider a reasonable tab limit (e.g., 5).
- The WebSocket URL pattern is already established: `/ws/sessions/:id/terminal/:shellId`.
