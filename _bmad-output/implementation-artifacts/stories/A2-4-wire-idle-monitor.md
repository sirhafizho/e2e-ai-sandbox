# Story A2.4: Wire Idle Monitor

> **Sprint:** A2 — Agent Loop Completeness | **Priority:** P1 | **Size:** M (1-3 hours)
> **Depends on:** Nothing
> **Audit ref:** P1-13 in `phase5-audit-findings.md`

## Problem

`IdleMonitor` (167 lines, `server/idle-monitor.ts`) is fully built and tested but **never instantiated or started**. Sessions never auto-timeout. Containers run forever, consuming resources.

The class supports:
- Warning at 55 minutes idle
- Pause at 60 minutes idle
- Destroy at 24 hours total

## What Needs to Happen

### 1. Instantiate IdleMonitor in app.ts

After the stores and sessions map are created (~line 84):

```typescript
import { IdleMonitor } from './idle-monitor.js';

const idleMonitor = new IdleMonitor(sessionStore, containerManager, sessions, {
  idleTimeoutMs: 60 * 60 * 1000,       // 1 hour
  warningMinutes: 5,                     // Warn 5 min before timeout
  destroyAfterMs: 24 * 60 * 60 * 1000, // Destroy after 24 hours
  checkIntervalMs: 60 * 1000,           // Check every minute
});
```

### 2. Wire the warning callback

The IdleMonitor needs to send `idle_warning` events to connected WebSocket clients. The challenge: IdleMonitor runs in a background interval and doesn't have access to WebSocket connections.

**Solution:** Use a callback that looks up the WebSocket connection for a session.

```typescript
// Track active WebSocket connections per session
const wsConnections = new Map<string, WebSocket>();

idleMonitor.setWarningCallback((sessionId, minutesRemaining) => {
  const ws = wsConnections.get(sessionId);
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({
      type: 'idle_warning',
      minutes_remaining: minutesRemaining,
    }));
  }
});
```

In the WebSocket handler, register/unregister connections:
```typescript
// On WebSocket open:
wsConnections.set(sessionId, ws);

// On WebSocket close:
wsConnections.delete(sessionId);
```

### 3. Start the monitor

In `start.ts` or at the end of `createApp()`:
```typescript
idleMonitor.start();
```

### 4. Touch activity on messages

The IdleMonitor uses `sessionStore.touchActivity()` to track last activity. This is already called in `app.ts:488` after messages. Verify it's also called in `ws-handler.ts` after WebSocket messages.

## Files to Modify

| File | Change |
|------|--------|
| `packages/server/src/server/app.ts` | Import and instantiate `IdleMonitor`, create `wsConnections` map, wire warning callback, export in return object |
| `packages/server/src/server/ws-handler.ts` | Register/unregister WebSocket connections in the `wsConnections` map, touch activity after messages |
| `packages/server/src/server/start.ts` | Call `idleMonitor.start()` after server starts |

## Acceptance Criteria

- [ ] Idle sessions receive an `idle_warning` WebSocket event 5 minutes before timeout
- [ ] Sessions idle for 60 minutes are paused (container paused)
- [ ] Sessions paused for 24 hours are destroyed (container removed)
- [ ] Active sessions (receiving messages) are never timed out
- [ ] The idle monitor starts when the server starts and stops on shutdown
- [ ] Existing tests still pass

## How to Verify

1. For quick testing, set `idleTimeoutMs` to 60_000 (1 minute) and `warningMinutes` to 0.5 (30 seconds)
2. Create a session, don't send any messages
3. After 30 seconds, the WebSocket should receive an `idle_warning` event
4. After 60 seconds, the session should be paused
5. Send a message to an active session — the timer should reset

## Notes

- The `wsConnections` map is the simplest approach. A more elegant solution would be an event emitter/bus, but that's overkill for now.
- The IdleMonitor's `check()` method iterates all sessions — this is fine for small numbers but won't scale to thousands. Good enough for v1.
- Make sure `idleMonitor.stop()` is called on server shutdown to clean up the interval.
