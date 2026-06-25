import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { UpgradeWebSocket } from 'hono/ws';
import { ContainerManager } from '../sandbox/container-manager.js';
import { ToolRegistry } from '../tools/registry.js';
import { registerBuiltinTools } from '../tools/register-builtins.js';
import { createProvider } from '../llm/provider.js';
import { AgentLoop } from '../agent/agent-loop.js';
import { createWsHandlers } from './ws-handler.js';
import type { LLMProviderConfig } from '@forge/shared';

interface SessionState {
  id: string;
  containerId: string;
  model: string;
  status: 'created' | 'booting' | 'ready' | 'running' | 'terminated';
  createdAt: string;
  volumeName?: string;
  agentLoop?: AgentLoop;
}

export function createApp(upgradeWebSocket?: UpgradeWebSocket) {
  const app = new Hono();
  const containerManager = new ContainerManager();
  const toolRegistry = new ToolRegistry();
  registerBuiltinTools(toolRegistry);

  const sessions = new Map<string, SessionState>();

  app.use('*', cors());

  // Health check
  app.get('/api/health', async (c) => {
    return c.json({
      status: 'healthy',
      version: '0.0.1',
      sessions: {
        active: sessions.size,
      },
    });
  });

  // Create session
  app.post('/api/sessions', async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const model = (body as { model?: string }).model ?? 'qwen2.5-coder:7b';
    const sessionId = `ses_${crypto.randomUUID().slice(0, 8)}`;

    try {
      const containerInfo = await containerManager.create({
        sessionId,
      });

      // Run health check
      const health = await containerManager.healthCheck(containerInfo.containerId);
      if (!health.healthy) {
        await containerManager.destroy(containerInfo.containerId);
        return c.json({ error: { code: 'CONTAINER_ERROR', message: 'Health check failed' } }, 500);
      }

      const session: SessionState = {
        id: sessionId,
        containerId: containerInfo.containerId,
        model,
        status: 'ready',
        createdAt: new Date().toISOString(),
        volumeName: containerInfo.volumeName,
      };

      sessions.set(sessionId, session);

      return c.json(
        {
          session: {
            id: session.id,
            status: session.status,
            model: session.model,
            created_at: session.createdAt,
            ws_url: `/ws/sessions/${session.id}`,
          },
        },
        201,
      );
    } catch (err) {
      return c.json(
        {
          error: {
            code: 'CONTAINER_ERROR',
            message: err instanceof Error ? err.message : 'Failed to create session',
          },
        },
        500,
      );
    }
  });

  // List sessions
  app.get('/api/sessions', (c) => {
    const sessionList = Array.from(sessions.values()).map((s) => ({
      id: s.id,
      status: s.status,
      model: s.model,
      created_at: s.createdAt,
    }));
    return c.json({ sessions: sessionList, total: sessionList.length });
  });

  // Get session
  app.get('/api/sessions/:id', (c) => {
    const session = sessions.get(c.req.param('id'));
    if (!session) {
      return c.json({ error: { code: 'SESSION_NOT_FOUND', message: 'Session not found' } }, 404);
    }
    return c.json({ session });
  });

  // Delete session
  app.delete('/api/sessions/:id', async (c) => {
    const session = sessions.get(c.req.param('id'));
    if (!session) {
      return c.json({ error: { code: 'SESSION_NOT_FOUND', message: 'Session not found' } }, 404);
    }

    try {
      await containerManager.destroy(session.containerId);
    } catch {
      // Container may already be gone
    }

    sessions.delete(session.id);
    return c.json({ deleted: true });
  });

  // List tools
  app.get('/api/tools', (c) => {
    const tools = toolRegistry.list().map((t) => ({
      name: t.name,
      description: t.description,
      category: t.category,
    }));
    return c.json({ tools });
  });

  // Send message (REST fallback — primary communication via WebSocket)
  app.post('/api/sessions/:id/messages', async (c) => {
    const session = sessions.get(c.req.param('id'));
    if (!session) {
      return c.json({ error: { code: 'SESSION_NOT_FOUND', message: 'Session not found' } }, 404);
    }

    if (session.status !== 'ready') {
      return c.json(
        { error: { code: 'SESSION_NOT_READY', message: `Session is ${session.status}` } },
        409,
      );
    }

    const body = await c.req.json();
    const content = (body as { content?: string }).content;
    if (!content) {
      return c.json({ error: { code: 'VALIDATION_ERROR', message: 'content is required' } }, 400);
    }

    session.status = 'running';

    // Lazily create agent loop per session (preserves conversation history)
    if (!session.agentLoop) {
      const providerConfig: LLMProviderConfig = {
        type: 'ollama',
        model: session.model,
      };
      const model = createProvider(providerConfig);
      session.agentLoop = new AgentLoop(model, toolRegistry, containerManager);
    }

    try {
      const events: unknown[] = [];
      for await (const event of session.agentLoop.run(content, {
        sessionId: session.id,
        containerId: session.containerId,
        model: session.model,
      })) {
        events.push(event);
      }

      session.status = 'ready';

      return c.json({
        events,
        history_length: session.agentLoop.getHistory().length,
      });
    } catch (err) {
      session.status = 'ready';
      return c.json(
        {
          error: {
            code: 'LLM_ERROR',
            message: err instanceof Error ? err.message : 'Agent loop failed',
          },
        },
        500,
      );
    }
  });

  // WebSocket endpoint for real-time streaming
  if (upgradeWebSocket) {
    app.get(
      '/ws/sessions/:id',
      upgradeWebSocket((c) => {
        const sessionId = c.req.param('id') ?? '';
        return createWsHandlers(sessionId, {
          sessions,
          containerManager,
          toolRegistry,
        });
      }),
    );
  }

  return { app, sessions, containerManager, toolRegistry };
}
