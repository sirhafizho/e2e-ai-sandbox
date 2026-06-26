import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { UpgradeWebSocket } from 'hono/ws';
import { ContainerManager } from '../sandbox/container-manager.js';
import { ToolRegistry } from '../tools/registry.js';
import { registerBuiltinTools } from '../tools/register-builtins.js';
import { createProvider } from '../llm/provider.js';
import { AgentLoop } from '../agent/agent-loop.js';
import { TokenBudget } from '../agent/token-budget.js';
import { createWsHandlers } from './ws-handler.js';
import { createTerminalHandlers, destroySessionTerminals } from './terminal-handler.js';
import { openDatabase, SessionStore, SettingsStore } from '../db/index.js';
import type { ServerSettings } from '../db/index.js';
import type { LLMProviderConfig } from '@forge/shared';
import { z } from 'zod';

const SettingsUpdateSchema = z.object({
  provider: z.object({
    type: z.enum(['ollama', 'openai', 'anthropic', 'openai-compatible']),
    base_url: z.string(),
    api_key: z.string(),
    model: z.string().min(1, 'Model name is required'),
  }).optional(),
  docker: z.object({
    image: z.string().min(1, 'Image name is required'),
    cpuLimit: z.number().int().min(1).max(64),
    memoryLimitGb: z.number().min(0.5).max(256),
  }).optional(),
}).refine((data) => data.provider || data.docker, {
  message: 'At least one of provider or docker must be provided',
});

export interface SessionState {
  id: string;
  containerId: string;
  model: string;
  status: 'created' | 'booting' | 'ready' | 'running' | 'terminated';
  createdAt: string;
  volumeName?: string;
  agentLoop?: AgentLoop;
}

export interface CreateAppOptions {
  /** Path to SQLite database file. Use ':memory:' for tests. Omit for default (~/.forge/forge.db). */
  dbPath?: string;
}

export function createApp(upgradeWebSocket?: UpgradeWebSocket, options?: CreateAppOptions) {
  const app = new Hono();
  const containerManager = new ContainerManager();
  const toolRegistry = new ToolRegistry();
  registerBuiltinTools(toolRegistry);

  // Persistent storage
  const db = openDatabase(options?.dbPath);
  const sessionStore = new SessionStore(db);
  const settingsStore = new SettingsStore(db);

  // In-memory state for active sessions (runtime-only data like agentLoop)
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

  // Get server settings
  app.get('/api/settings', (c) => {
    const settings = settingsStore.getAll();
    // Redact API key in responses — send masked version
    const redacted = {
      ...settings,
      provider: {
        ...settings.provider,
        api_key: settings.provider.api_key ? '••••••••' : '',
      },
    };
    return c.json({ settings: redacted });
  });

  // Update server settings
  app.put('/api/settings', async (c) => {
    const rawBody = await c.req.json().catch(() => ({}));
    const parsed = SettingsUpdateSchema.safeParse(rawBody);
    if (!parsed.success) {
      return c.json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid settings',
          details: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
        },
      }, 400);
    }

    const body = parsed.data as Partial<ServerSettings>;
    // If api_key is the redacted placeholder, don't overwrite the real key
    if (body.provider?.api_key === '••••••••') {
      const current = settingsStore.getAll();
      body.provider.api_key = current.provider.api_key;
    }
    const updated = settingsStore.saveAll(body);
    return c.json({
      settings: {
        ...updated,
        provider: {
          ...updated.provider,
          api_key: updated.provider.api_key ? '••••••••' : '',
        },
      },
    });
  });

  // Create session
  app.post('/api/sessions', async (c) => {
    const body = await c.req.json().catch(() => ({}));
    const serverSettings = settingsStore.getAll();
    const model = (body as { model?: string }).model ?? serverSettings.provider.model;
    const sessionId = `ses_${crypto.randomUUID().slice(0, 8)}`;

    try {
      const containerInfo = await containerManager.create({
        sessionId,
        image: serverSettings.docker.image !== 'forge-sandbox:base' ? serverSettings.docker.image : undefined,
        cpuLimit: serverSettings.docker.cpuLimit,
        memoryLimit: serverSettings.docker.memoryLimitGb * 1024 * 1024 * 1024,
      });

      // Run health check
      const health = await containerManager.healthCheck(containerInfo.containerId);
      if (!health.healthy) {
        await containerManager.destroy(containerInfo.containerId);
        return c.json({ error: { code: 'CONTAINER_ERROR', message: 'Health check failed' } }, 500);
      }

      // Persist to SQLite
      const dbRow = sessionStore.create({
        id: sessionId,
        model,
        containerId: containerInfo.containerId,
        volumeName: containerInfo.volumeName,
      });

      // Keep in-memory state for runtime
      const session: SessionState = {
        id: sessionId,
        containerId: containerInfo.containerId,
        model,
        status: 'ready',
        createdAt: dbRow.created_at,
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

  // List sessions (merged: persisted + in-memory status)
  app.get('/api/sessions', (c) => {
    const dbSessions = sessionStore.list();
    const sessionList = dbSessions.map((row) => {
      const live = sessions.get(row.id);
      return {
        id: row.id,
        status: live?.status ?? row.status,
        model: row.model,
        container_id: row.container_id,
        created_at: row.created_at,
        updated_at: row.updated_at,
        last_active_at: row.last_active_at,
      };
    });
    return c.json({ sessions: sessionList, total: sessionList.length });
  });

  // Get session
  app.get('/api/sessions/:id', (c) => {
    const id = c.req.param('id');
    const live = sessions.get(id);
    const dbRow = sessionStore.get(id);

    if (!live && !dbRow) {
      return c.json({ error: { code: 'SESSION_NOT_FOUND', message: 'Session not found' } }, 404);
    }

    return c.json({
      session: {
        id: dbRow?.id ?? live!.id,
        status: live?.status ?? dbRow!.status,
        model: dbRow?.model ?? live!.model,
        container_id: dbRow?.container_id ?? live?.containerId ?? null,
        created_at: dbRow?.created_at ?? live!.createdAt,
        updated_at: dbRow?.updated_at ?? live!.createdAt,
        last_active_at: dbRow?.last_active_at ?? live!.createdAt,
        is_live: !!live,
      },
    });
  });

  // Delete session
  app.delete('/api/sessions/:id', async (c) => {
    const id = c.req.param('id');
    const session = sessions.get(id);
    const dbRow = sessionStore.get(id);

    if (!session && !dbRow) {
      return c.json({ error: { code: 'SESSION_NOT_FOUND', message: 'Session not found' } }, 404);
    }

    // Destroy container if live
    const containerId = session?.containerId ?? dbRow?.container_id;
    if (containerId) {
      try {
        await containerManager.destroy(containerId);
      } catch {
        // Container may already be gone
      }
    }

    // Clean up terminal sessions
    destroySessionTerminals(id);
    sessions.delete(id);
    sessionStore.terminate(id);
    return c.json({ deleted: true });
  });

  // File access — list directory or read file content from sandbox container
  app.get('/api/sessions/:id/files', async (c) => {
    const id = c.req.param('id');
    const session = sessions.get(id);
    if (!session) {
      return c.json({ error: { code: 'SESSION_NOT_FOUND', message: 'Session not found' } }, 404);
    }

    const path = c.req.query('path') ?? '/workspace';

    try {
      // Check if path is a file or directory
      const typeResult = await containerManager.exec(session.containerId, `stat -c '%F' ${JSON.stringify(path)}`, {
        timeoutMs: 5000,
      });

      if (typeResult.exitCode !== 0) {
        return c.json({ error: { code: 'PATH_NOT_FOUND', message: `Path not found: ${path}` } }, 404);
      }

      const fileType = typeResult.stdout.trim();

      if (fileType === 'directory') {
        // List directory contents with type info
        const lsResult = await containerManager.exec(
          session.containerId,
          `find ${JSON.stringify(path)} -maxdepth 1 -mindepth 1 -printf '%y %p\\n' 2>/dev/null | sort -t/ -k2`,
          { timeoutMs: 10_000 },
        );

        const files = lsResult.stdout
          .trim()
          .split('\n')
          .filter((line) => line.length > 0)
          .map((line) => {
            const spaceIdx = line.indexOf(' ');
            const typeChar = line.substring(0, spaceIdx);
            const fullPath = line.substring(spaceIdx + 1);
            const name = fullPath.split('/').pop() ?? fullPath;
            return {
              name,
              path: fullPath,
              type: typeChar === 'd' ? ('directory' as const) : ('file' as const),
            };
          })
          // Sort: directories first, then alphabetical
          .sort((a, b) => {
            if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
            return a.name.localeCompare(b.name);
          });

        // For directories, fetch their children (one level deep)
        const filesWithChildren = await Promise.all(
          files.map(async (f) => {
            if (f.type === 'directory') {
              const childResult = await containerManager.exec(
                session.containerId,
                `find ${JSON.stringify(f.path)} -maxdepth 1 -mindepth 1 -printf '%y %p\\n' 2>/dev/null | sort -t/ -k2`,
                { timeoutMs: 5000 },
              );
              const children = childResult.stdout
                .trim()
                .split('\n')
                .filter((line) => line.length > 0)
                .map((line) => {
                  const si = line.indexOf(' ');
                  const tc = line.substring(0, si);
                  const fp = line.substring(si + 1);
                  const n = fp.split('/').pop() ?? fp;
                  return { name: n, path: fp, type: tc === 'd' ? ('directory' as const) : ('file' as const) };
                })
                .sort((a, b) => {
                  if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
                  return a.name.localeCompare(b.name);
                });
              return { ...f, children };
            }
            return f;
          }),
        );

        return c.json({ files: filesWithChildren });
      } else {
        // Read file content
        const readResult = await containerManager.exec(
          session.containerId,
          `cat ${JSON.stringify(path)}`,
          { timeoutMs: 10_000 },
        );

        if (readResult.exitCode !== 0) {
          return c.json({ error: { code: 'FILE_READ_ERROR', message: readResult.stderr || 'Failed to read file' } }, 500);
        }

        return c.json({ content: readResult.stdout });
      }
    } catch (err) {
      return c.json({
        error: {
          code: 'EXEC_ERROR',
          message: err instanceof Error ? err.message : 'Failed to access files',
        },
      }, 500);
    }
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

  // Get conversation history for a session
  app.get('/api/sessions/:id/messages', (c) => {
    const id = c.req.param('id');
    const session = sessions.get(id);
    const dbRow = sessionStore.get(id);

    if (!session && !dbRow) {
      return c.json({ error: { code: 'SESSION_NOT_FOUND', message: 'Session not found' } }, 404);
    }

    // If the session has a live agent loop, get messages from it
    if (session?.agentLoop) {
      const history = session.agentLoop.getHistory();
      const messages = history.getMessages();
      return c.json({
        messages,
        total: messages.length,
        context_summary: history.getContextSummary(),
      });
    }

    // Otherwise, load from the database
    const historyJson = dbRow?.history_json ?? '[]';
    try {
      const messages = JSON.parse(historyJson) as unknown[];
      return c.json({
        messages,
        total: messages.length,
        context_summary: dbRow?.context_summary ?? null,
      });
    } catch {
      return c.json({ messages: [], total: 0, context_summary: null });
    }
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
      const settings = settingsStore.getAll();
      const providerConfig: LLMProviderConfig = {
        type: settings.provider.type,
        base_url: settings.provider.base_url || undefined,
        api_key: settings.provider.api_key || undefined,
        model: session.model,
      };
      const model = createProvider(providerConfig);
      session.agentLoop = new AgentLoop(model, toolRegistry, containerManager, {
        tokenBudget: TokenBudget.forModel(session.model),
      });
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

      // Persist conversation history to SQLite
      const history = session.agentLoop.getHistory();
      sessionStore.updateHistory(
        session.id,
        JSON.stringify(history.getMessages()),
        history.getContextSummary(),
      );
      sessionStore.touchActivity(session.id);

      return c.json({
        events,
        history_length: history.length,
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

  // Resume a persisted session (re-attach container and load history)
  app.post('/api/sessions/:id/resume', async (c) => {
    const id = c.req.param('id');

    // Already live?
    if (sessions.has(id)) {
      return c.json({ session: { id, status: sessions.get(id)!.status, resumed: false, reason: 'already_live' } });
    }

    const dbRow = sessionStore.get(id);
    if (!dbRow) {
      return c.json({ error: { code: 'SESSION_NOT_FOUND', message: 'Session not found' } }, 404);
    }

    if (dbRow.status === 'terminated') {
      return c.json({ error: { code: 'SESSION_TERMINATED', message: 'Cannot resume terminated session' } }, 409);
    }

    // Re-create a container for this session
    try {
      const containerInfo = await containerManager.create({ sessionId: id });
      const health = await containerManager.healthCheck(containerInfo.containerId);
      if (!health.healthy) {
        await containerManager.destroy(containerInfo.containerId);
        return c.json({ error: { code: 'CONTAINER_ERROR', message: 'Health check failed on resume' } }, 500);
      }

      // Update DB with new container
      sessionStore.update(id, {
        status: 'ready',
        containerId: containerInfo.containerId,
        volumeName: containerInfo.volumeName,
      });

      // Hydrate in-memory state
      const session: SessionState = {
        id,
        containerId: containerInfo.containerId,
        model: dbRow.model,
        status: 'ready',
        createdAt: dbRow.created_at,
        volumeName: containerInfo.volumeName,
      };

      sessions.set(id, session);

      return c.json({
        session: {
          id,
          status: 'ready',
          model: dbRow.model,
          created_at: dbRow.created_at,
          ws_url: `/ws/sessions/${id}`,
          resumed: true,
          history_length: JSON.parse(dbRow.history_json).length,
        },
      });
    } catch (err) {
      return c.json({
        error: {
          code: 'CONTAINER_ERROR',
          message: err instanceof Error ? err.message : 'Failed to resume session',
        },
      }, 500);
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
          sessionStore,
          settingsStore,
        });
      }),
    );

    // Terminal PTY WebSocket — interactive shell access
    app.get(
      '/ws/sessions/:id/terminal/:shellId',
      upgradeWebSocket((c) => {
        const sessionId = c.req.param('id') ?? '';
        const shellId = c.req.param('shellId') ?? 'default';
        return createTerminalHandlers(sessionId, shellId, {
          sessions,
          containerManager,
        });
      }),
    );
  }

  return { app, sessions, containerManager, toolRegistry, sessionStore, settingsStore };
}
