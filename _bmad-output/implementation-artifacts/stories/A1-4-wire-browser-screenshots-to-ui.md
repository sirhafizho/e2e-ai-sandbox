# Story A1.4: Wire Browser Screenshots to UI

> **Sprint:** A1 — Critical Wiring | **Priority:** P0 | **Size:** S (< 1 hour)
> **Depends on:** Nothing
> **Audit ref:** P0-17 in `phase5-audit-findings.md`

## Problem

The browser panel in the UI listens for `browser_screenshot` events (`SessionPage.tsx:128-133`):
```typescript
ws.on('browser_screenshot', (data) => {
  setBrowserScreenshot(
    (data.screenshot as string) ?? null,
    data.url as string | undefined,
  );
});
```

But the server **never sends `browser_screenshot` events**. When the agent uses `browser_navigate` or `browser_screenshot` tools, the output (including base64 PNG) is sent as a `tool_complete` event with the screenshot buried in the tool result. The UI doesn't extract it.

The browser panel is completely dead — always shows "No screenshot available".

## What Needs to Happen

Two viable approaches:

### Option A: Emit `browser_screenshot` from ws-handler (Recommended)

In `ws-handler.ts`, when forwarding `tool_complete` events, check if the completed tool is a browser tool that returned a screenshot. If so, also emit a `browser_screenshot` event.

In the `tool_complete` case (~line 170-177):
```typescript
case 'tool_complete': {
  const data = agentEvent.data as ToolCompleteData;
  send(ws, {
    type: 'tool_complete',
    call_id: data.callId,
    result: data.output,
    duration_ms: data.durationMs,
    is_error: data.isError,
  });
  
  // If this was a browser tool, extract and forward screenshot
  if (!data.isError && data.output && typeof data.output === 'object') {
    const output = data.output as Record<string, unknown>;
    if (output.screenshot || output.base64_image) {
      send(ws, {
        type: 'browser_screenshot',
        screenshot: (output.base64_image ?? output.screenshot) as string,
        url: (output.url as string) ?? undefined,
      });
    }
  }
  break;
}
```

### Option B: Extract in the UI

In `SessionPage.tsx`, when receiving `tool_complete` events, check if the output contains screenshot data and update the browser panel. This keeps the server simpler but mixes concerns in the UI.

**Recommended: Option A** — keeps the UI clean and matches the event the UI already expects.

## Browser Tool Output Formats

From `browser-tools.ts`:

- `browser_navigate` returns: `{ title, url, status }` (no screenshot by default)
- `browser_screenshot` returns: `{ base64_image, width, height }` 
- `browser_click` returns: `{ success }`
- `browser_type` returns: `{ success }`
- `browser_evaluate` returns: `{ result }`
- `browser_get_text` returns: `{ text }`

So screenshots come from `browser_screenshot` tool output with field `base64_image`.

## Files to Modify

| File | Change |
|------|--------|
| `packages/server/src/server/ws-handler.ts` | In the `tool_complete` case, detect browser screenshot output and emit `browser_screenshot` event |

## Acceptance Criteria

- [ ] When the agent takes a screenshot, it appears in the browser panel
- [ ] The URL bar in the browser panel updates with the page URL
- [ ] Non-browser tool completions don't trigger `browser_screenshot` events
- [ ] If the screenshot is null or missing, no event is sent
- [ ] Existing tests still pass

## How to Verify

1. Start server and UI
2. Open a session
3. Send: "Navigate to https://example.com and take a screenshot"
4. The browser panel should display the screenshot
5. The URL bar should show "https://example.com"

## Notes

- The `browser_screenshot` event type needs to be in the `WebSocketEventType` union in `websocket.ts`. It's already there (line 11: `'browser_screenshot'`).
- Screenshots are base64 PNG strings. The UI already handles this (`BrowserPanel.tsx` renders `<img src={...} />`).
- The `browser_navigate` tool doesn't take a screenshot by default. Only `browser_screenshot` returns image data. Consider having `browser_navigate` also return a screenshot (small enhancement, can be follow-up).
