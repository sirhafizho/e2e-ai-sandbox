import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { WebSocket, WebSocketServer } from 'ws';
import { serve, upgradeWebSocket } from '@hono/node-server';
import { createApp } from '../app.js';
import type { ServerWebSocketEvent } from '@forge/shared';

// Helper: collect WS messages with a timeout
function collectMessages(
  ws: WebSocket,
  count: number,
  timeoutMs = 5000,
): Promise<ServerWebSocketEvent[]> {
  return new Promise((resolve, reject) => {
    const messages: ServerWebSocketEvent[] = [];
    const timer = setTimeout(() => {
      resolve(messages); // Return what we have on timeout
    }, timeoutMs);

    ws.on('message', (data: Buffer) => {
      try {
        const parsed = JSON.parse(data.toString()) as ServerWebSocketEvent;
        messages.push(parsed);
        if (messages.length >= count) {
          clearTimeout(timer);
          resolve(messages);
        }
      } catch {
        // Ignore unparseable messages (like pings)
      }
    });

    ws.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

// Helper: wait for WebSocket open
function waitForOpen(ws: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    if (ws.readyState === WebSocket.OPEN) {
      resolve();
      return;
    }
    ws.once('open', resolve);
    ws.once('error', reject);
  });
}

describe('WebSocket Handler', () => {
  let server: ReturnType<typeof serve>;
  let port: number;
  let sessionId: string;
  let idleMonitor: { stop: () => void };

  before(async () => {
    const wss = new WebSocketServer({ noServer: true });
    const result = createApp(upgradeWebSocket);
    idleMonitor = result.idleMonitor;

    // Find a free port
    port = 3100 + Math.floor(Math.random() * 900);

    server = serve({
      fetch: result.app.fetch,
      port,
      websocket: { server: wss },
    });

    // Create a session via REST API
    const res = await fetch(`http://localhost:${port}/api/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'qwen2.5-coder:7b' }),
    });
    const body = (await res.json()) as { session: { id: string } };
    sessionId = body.session.id;
  });

  after(async () => {
    // Clean up session
    await fetch(`http://localhost:${port}/api/sessions/${sessionId}`, {
      method: 'DELETE',
    }).catch(() => {});

    idleMonitor.stop();
    server.close();
    // Wait for server to close
    await new Promise((resolve) => setTimeout(resolve, 500));
  });

  it('should send greeting and session_status on connect', async () => {
    const ws = new WebSocket(`ws://localhost:${port}/ws/sessions/${sessionId}`);

    // Set up message collection before waiting for open
    const messagesPromise = collectMessages(ws, 2, 5000);
    await waitForOpen(ws);

    const messages = await messagesPromise;

    assert.ok(messages.length >= 2, `Expected at least 2 messages, got ${messages.length}`);
    assert.equal(messages[0]?.type, 'greeting');
    assert.ok(
      (messages[0] as { message: string }).message.includes(sessionId),
      'Greeting should contain session ID',
    );
    assert.equal(messages[1]?.type, 'session_status');

    ws.close();
  });

  it('should reject invalid messages with error event', async () => {
    const ws = new WebSocket(`ws://localhost:${port}/ws/sessions/${sessionId}`);
    await waitForOpen(ws);

    // Consume greeting + status
    await collectMessages(ws, 2, 2000);

    // Send invalid message
    ws.send(JSON.stringify({ type: 'invalid_type' }));

    const errorMessages = await collectMessages(ws, 1, 3000);
    assert.ok(errorMessages.length >= 1, 'Should receive error event');
    assert.equal(errorMessages[0]?.type, 'error');
    assert.equal((errorMessages[0] as { code: string }).code, 'INVALID_MESSAGE');

    ws.close();
  });

  it('should return error for non-existent session', async () => {
    const ws = new WebSocket(`ws://localhost:${port}/ws/sessions/nonexistent`);

    // Set up collection before open
    const messagesPromise = collectMessages(ws, 1, 5000);
    await waitForOpen(ws);

    const messages = await messagesPromise;

    assert.ok(messages.length >= 1, 'Should receive error event');
    assert.equal(messages[0]?.type, 'error');
    assert.equal((messages[0] as { code: string }).code, 'SESSION_NOT_FOUND');

    ws.close();
  });

  it('should handle cancel event without crashing', async () => {
    const ws = new WebSocket(`ws://localhost:${port}/ws/sessions/${sessionId}`);
    await waitForOpen(ws);

    // Consume greeting + status
    await collectMessages(ws, 2, 2000);

    // Send cancel when nothing is running — should not crash
    ws.send(JSON.stringify({ type: 'cancel' }));

    // Wait a bit to confirm no crash
    await new Promise((resolve) => setTimeout(resolve, 500));
    assert.equal(ws.readyState, WebSocket.OPEN, 'Connection should still be open');

    ws.close();
  });
});
