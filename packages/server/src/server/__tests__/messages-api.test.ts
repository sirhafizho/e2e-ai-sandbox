import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { serve } from '@hono/node-server';
import { createApp } from '../app.js';

describe('Messages API', () => {
  let server: ReturnType<typeof serve>;
  let port: number;
  let sessionId: string;

  before(async () => {
    const { app } = createApp(undefined);

    port = 3300 + Math.floor(Math.random() * 700);
    server = serve({ fetch: app.fetch, port });

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

  it('should return empty messages for new session', async () => {
    const res = await fetch(`http://localhost:${port}/api/sessions/${sessionId}/messages`);
    assert.equal(res.status, 200);
    const data = (await res.json()) as { messages: unknown[]; total: number; context_summary: string | null };
    assert.ok(Array.isArray(data.messages), 'Should have messages array');
    assert.equal(data.total, 0, 'New session should have no messages');
    assert.equal(data.context_summary, null);
  });

  it('should return 404 for nonexistent session', async () => {
    const res = await fetch(`http://localhost:${port}/api/sessions/nonexistent/messages`);
    assert.equal(res.status, 404);
    const data = (await res.json()) as { error: { code: string } };
    assert.equal(data.error.code, 'SESSION_NOT_FOUND');
  });
});
