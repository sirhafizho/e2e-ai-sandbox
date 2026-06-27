import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { serve } from '@hono/node-server';
import { createApp } from '../app.js';

describe('Files API', () => {
  let server: ReturnType<typeof serve>;
  let port: number;
  let sessionId: string;
  let idleMonitor: { stop: () => void };

  before(async () => {
    const result = createApp(undefined);
    idleMonitor = result.idleMonitor;

    port = 3200 + Math.floor(Math.random() * 800);
    server = serve({ fetch: result.app.fetch, port });

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
    idleMonitor.stop();
    server.close();
    await new Promise((resolve) => setTimeout(resolve, 500));
  });

  it('should list /workspace directory', async () => {
    const res = await fetch(
      `http://localhost:${port}/api/sessions/${sessionId}/files?path=${encodeURIComponent('/workspace')}`,
    );
    assert.equal(res.status, 200);
    const data = (await res.json()) as { files: Array<{ name: string; path: string; type: string }> };
    assert.ok(Array.isArray(data.files), 'Response should have files array');
    // /workspace exists in the container (created by ContainerManager)
    // It should contain .forge/ directory at minimum
    const forgeDir = data.files.find((f) => f.name === '.forge');
    assert.ok(forgeDir, 'Should contain .forge directory');
    assert.equal(forgeDir!.type, 'directory');
  });

  it('should read file content', async () => {
    // /etc/hostname always exists in a container
    const res = await fetch(
      `http://localhost:${port}/api/sessions/${sessionId}/files?path=${encodeURIComponent('/etc/hostname')}`,
    );
    assert.equal(res.status, 200);
    const data = (await res.json()) as { content: string };
    assert.ok(typeof data.content === 'string', 'Response should have content string');
    assert.ok(data.content.length > 0, 'Content should not be empty');
  });

  it('should return 404 for nonexistent path', async () => {
    const res = await fetch(
      `http://localhost:${port}/api/sessions/${sessionId}/files?path=${encodeURIComponent('/nonexistent/path')}`,
    );
    assert.equal(res.status, 404);
  });

  it('should return 404 for nonexistent session', async () => {
    const res = await fetch(
      `http://localhost:${port}/api/sessions/nonexistent/files?path=${encodeURIComponent('/workspace')}`,
    );
    assert.equal(res.status, 404);
    const data = (await res.json()) as { error: { code: string } };
    assert.equal(data.error.code, 'SESSION_NOT_FOUND');
  });

  it('should return directory children one level deep', async () => {
    const res = await fetch(
      `http://localhost:${port}/api/sessions/${sessionId}/files?path=${encodeURIComponent('/workspace')}`,
    );
    assert.equal(res.status, 200);
    const data = (await res.json()) as {
      files: Array<{ name: string; type: string; children?: Array<{ name: string }> }>;
    };
    // Directories should have children arrays
    const dirs = data.files.filter((f) => f.type === 'directory');
    for (const dir of dirs) {
      assert.ok(Array.isArray(dir.children), `Directory ${dir.name} should have children array`);
    }
  });
});
