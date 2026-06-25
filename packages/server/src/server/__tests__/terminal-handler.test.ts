import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { WebSocket, WebSocketServer } from 'ws';
import { serve, upgradeWebSocket } from '@hono/node-server';
import { createApp } from '../app.js';

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

// Helper: collect raw messages with a timeout
function collectRawMessages(ws: WebSocket, count: number, timeoutMs = 10_000): Promise<string[]> {
  return new Promise((resolve) => {
    const messages: string[] = [];
    const timer = setTimeout(() => resolve(messages), timeoutMs);

    ws.on('message', (data: Buffer) => {
      messages.push(data.toString('utf-8'));
      if (messages.length >= count) {
        clearTimeout(timer);
        resolve(messages);
      }
    });
  });
}

describe('Terminal WebSocket Handler', () => {
  let server: ReturnType<typeof serve>;
  let port: number;
  let sessionId: string;

  before(async () => {
    const wss = new WebSocketServer({ noServer: true });
    const { app } = createApp(upgradeWebSocket);

    port = 3400 + Math.floor(Math.random() * 600);

    server = serve({
      fetch: app.fetch,
      port,
      websocket: { server: wss },
    });

    // Create a session
    const res = await fetch(`http://localhost:${port}/api/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'qwen2.5-coder:7b' }),
    });
    const body = (await res.json()) as { session: { id: string } };
    sessionId = body.session.id;
  });

  after(async () => {
    await fetch(`http://localhost:${port}/api/sessions/${sessionId}`, {
      method: 'DELETE',
    }).catch(() => {});
    server.close();
    await new Promise((resolve) => setTimeout(resolve, 500));
  });

  it('should connect to terminal and receive PTY output', async () => {
    const ws = new WebSocket(`ws://localhost:${port}/ws/sessions/${sessionId}/terminal/default`);

    const messagesPromise = collectRawMessages(ws, 1, 10_000);
    await waitForOpen(ws);

    // We should get some initial shell output (bash prompt or similar)
    const messages = await messagesPromise;
    assert.ok(messages.length >= 1, 'Should receive at least one message from PTY');

    ws.close();
  });

  it('should execute commands and receive output', async () => {
    const ws = new WebSocket(`ws://localhost:${port}/ws/sessions/${sessionId}/terminal/test-shell`);

    await waitForOpen(ws);

    // Wait for shell to be ready (initial prompt)
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Send a command
    ws.send('echo FORGE_TEST_OUTPUT\n');

    // Collect output
    const messages = await collectRawMessages(ws, 1, 5000);
    const allOutput = messages.join('');

    assert.ok(
      allOutput.includes('FORGE_TEST_OUTPUT'),
      `Should see command output in terminal. Got: ${allOutput.slice(0, 200)}`,
    );

    ws.close();
  });

  it('should reject non-existent session', async () => {
    const ws = new WebSocket(`ws://localhost:${port}/ws/sessions/nonexistent/terminal/default`);

    const messagesPromise = collectRawMessages(ws, 1, 5000);
    await waitForOpen(ws);

    const messages = await messagesPromise;
    const allOutput = messages.join('');
    assert.ok(allOutput.includes('Session not found'), 'Should receive error message');

    ws.close();
  });

  it('should handle resize messages without error', async () => {
    const ws = new WebSocket(`ws://localhost:${port}/ws/sessions/${sessionId}/terminal/resize-test`);
    await waitForOpen(ws);

    // Wait for shell to be ready
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Send resize
    ws.send(JSON.stringify({ type: 'resize', cols: 120, rows: 40 }));

    // Should not crash — wait a bit and verify connection is still open
    await new Promise((resolve) => setTimeout(resolve, 500));
    assert.equal(ws.readyState, WebSocket.OPEN, 'Connection should still be open after resize');

    ws.close();
  });
});
