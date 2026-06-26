import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { serve } from '@hono/node-server';
import { createApp } from '../app.js';

describe('Settings API', () => {
  let server: ReturnType<typeof serve>;
  let port: number;

  before(() => {
    const { app } = createApp(undefined, { dbPath: ':memory:' });

    port = 3400 + Math.floor(Math.random() * 600);
    server = serve({ fetch: app.fetch, port });
  });

  after(async () => {
    server.close();
    await new Promise((resolve) => setTimeout(resolve, 500));
  });

  it('should return default settings on fresh DB', async () => {
    const res = await fetch(`http://localhost:${port}/api/settings`);
    assert.equal(res.status, 200);
    const data = (await res.json()) as {
      settings: {
        provider: { type: string; base_url: string; api_key: string; model: string };
        docker: { image: string; cpuLimit: number; memoryLimitGb: number };
      };
    };

    assert.equal(data.settings.provider.type, 'ollama');
    assert.equal(data.settings.provider.model, 'qwen2.5-coder:7b');
    assert.equal(data.settings.provider.api_key, '');
    assert.equal(data.settings.docker.image, 'forge-sandbox:base');
    assert.equal(data.settings.docker.cpuLimit, 2);
    assert.equal(data.settings.docker.memoryLimitGb, 4);
  });

  it('should save and return updated settings', async () => {
    const res = await fetch(`http://localhost:${port}/api/settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider: {
          type: 'openai',
          base_url: 'https://api.openai.com/v1',
          api_key: 'sk-test-12345',
          model: 'gpt-4o',
        },
      }),
    });
    assert.equal(res.status, 200);
    const data = (await res.json()) as {
      settings: {
        provider: { type: string; base_url: string; api_key: string; model: string };
        docker: { image: string; cpuLimit: number; memoryLimitGb: number };
      };
    };

    assert.equal(data.settings.provider.type, 'openai');
    assert.equal(data.settings.provider.model, 'gpt-4o');
    // API key should be redacted in response
    assert.equal(data.settings.provider.api_key, '••••••••');
    // Docker should remain defaults
    assert.equal(data.settings.docker.image, 'forge-sandbox:base');
  });

  it('should persist settings across GET calls', async () => {
    const res = await fetch(`http://localhost:${port}/api/settings`);
    assert.equal(res.status, 200);
    const data = (await res.json()) as {
      settings: {
        provider: { type: string; model: string; api_key: string };
      };
    };

    // Should still be openai from previous test
    assert.equal(data.settings.provider.type, 'openai');
    assert.equal(data.settings.provider.model, 'gpt-4o');
    assert.equal(data.settings.provider.api_key, '••••••••');
  });

  it('should not overwrite API key with redacted placeholder', async () => {
    // First, save a real API key
    await fetch(`http://localhost:${port}/api/settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider: {
          type: 'openai',
          base_url: 'https://api.openai.com/v1',
          api_key: 'sk-real-secret-key',
          model: 'gpt-4o',
        },
      }),
    });

    // Now send back the redacted placeholder (simulating a UI save)
    const res = await fetch(`http://localhost:${port}/api/settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider: {
          type: 'openai',
          base_url: 'https://api.openai.com/v1',
          api_key: '••••••••',
          model: 'gpt-4o-mini',
        },
      }),
    });
    assert.equal(res.status, 200);
    const data = (await res.json()) as {
      settings: {
        provider: { model: string; api_key: string };
      };
    };

    // Model should be updated
    assert.equal(data.settings.provider.model, 'gpt-4o-mini');
    // API key should still show as redacted (not overwritten)
    assert.equal(data.settings.provider.api_key, '••••••••');
  });

  it('should update docker settings independently', async () => {
    const res = await fetch(`http://localhost:${port}/api/settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        docker: {
          image: 'custom-sandbox:v2',
          cpuLimit: 4,
          memoryLimitGb: 8,
        },
      }),
    });
    assert.equal(res.status, 200);
    const data = (await res.json()) as {
      settings: {
        provider: { type: string };
        docker: { image: string; cpuLimit: number; memoryLimitGb: number };
      };
    };

    assert.equal(data.settings.docker.image, 'custom-sandbox:v2');
    assert.equal(data.settings.docker.cpuLimit, 4);
    assert.equal(data.settings.docker.memoryLimitGb, 8);
    // Provider should be unchanged
    assert.equal(data.settings.provider.type, 'openai');
  });

  it('should return 400 for invalid settings (empty body)', async () => {
    const res = await fetch(`http://localhost:${port}/api/settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    assert.equal(res.status, 400);
    const data = (await res.json()) as { error: { code: string; message: string } };
    assert.equal(data.error.code, 'VALIDATION_ERROR');
  });

  it('should return 400 for invalid provider type', async () => {
    const res = await fetch(`http://localhost:${port}/api/settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider: {
          type: 'invalid-provider',
          base_url: 'http://localhost',
          api_key: '',
          model: 'test',
        },
      }),
    });
    assert.equal(res.status, 400);
    const data = (await res.json()) as { error: { code: string; details: Array<{ path: string }> } };
    assert.equal(data.error.code, 'VALIDATION_ERROR');
  });

  it('should return 400 for invalid docker limits', async () => {
    const res = await fetch(`http://localhost:${port}/api/settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        docker: {
          image: 'test',
          cpuLimit: 0,
          memoryLimitGb: -1,
        },
      }),
    });
    assert.equal(res.status, 400);
    const data = (await res.json()) as { error: { code: string } };
    assert.equal(data.error.code, 'VALIDATION_ERROR');
  });
});
