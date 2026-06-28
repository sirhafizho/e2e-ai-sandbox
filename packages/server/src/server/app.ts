import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { UpgradeWebSocket } from 'hono/ws';
import { ContainerManager } from '../sandbox/container-manager.js';
import { ToolRegistry } from '../tools/registry.js';
import { registerBuiltinTools } from '../tools/register-builtins.js';
import { createProvider } from '../llm/provider.js';
import { AgentLoop } from '../agent/agent-loop.js';
import { ConversationHistory } from '../agent/conversation-history.js';
import { TokenBudget, isSmallModel } from '../agent/token-budget.js';
import { buildSystemPrompt } from '../agent/system-prompt.js';
import { filterToolsForSmallModel } from '../agent/tool-filter.js';
import { createWsHandlers } from './ws-handler.js';
import { createTerminalHandlers, destroySessionTerminals } from './terminal-handler.js';
import {
  openDatabase,
  SessionStore,
  SettingsStore,
  KnowledgeStore,
  SessionHistoryStore,
  RepoMapStore,
  SecretsStore,
  CheckpointStore,
} from '../db/index.js';
import type { ServerSettings } from '../db/index.js';
import { KnowledgeInjector } from '../knowledge/knowledge-injector.js';
import { RepoMapGenerator } from '../knowledge/repo-map-generator.js';
import { CheckpointManager } from '../knowledge/checkpoint-manager.js';
import { IdleMonitor } from './idle-monitor.js';
import { NoteSuggester } from '../knowledge/note-suggester.js';
import type { LLMProviderConfig } from '@forge/shared';
import { CreateKnowledgeNoteInput as CreateNoteSchema } from '@forge/shared';
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
  repo?: string;
  /** Checkpoint resume context to inject into the next system prompt. */
  resumeContext?: string;
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
  const knowledgeStore = new KnowledgeStore(db);
  const sessionHistoryStore = new SessionHistoryStore(db);
  const repoMapStore = new RepoMapStore(db);
  const secretsStore = new SecretsStore(db);
  const checkpointStore = new CheckpointStore(db);

  // Repo map generation (structural overview of codebases)
  const repoMapGenerator = new RepoMapGenerator();

  // Knowledge injection (combines notes, rules, history, repo map)
  const knowledgeInjector = new KnowledgeInjector({
    knowledgeStore,
    sessionHistoryStore,
    repoMapStore,
    containerManager,
  });

  // Checkpoint management (save/restore agent state at token budget emergency)
  const checkpointManager = new CheckpointManager(checkpointStore);

  // Note suggestion (auto-learns from conversations)
  const noteSuggester = new NoteSuggester(knowledgeStore);

  // In-memory state for active sessions (runtime-only data like agentLoop)
  const sessions = new Map<string, SessionState>();

  // Track active WebSocket connections per session (for idle monitor warnings)
  const wsConnections = new Map<string, { send: (data: string) => void }>();

  // Idle monitor — background cleanup loop for idle sessions
  const idleMonitor = new IdleMonitor(sessionStore, containerManager, sessions, {
    idleTimeoutMs: 60 * 60 * 1000,       // 1 hour
    warningMinutes: 5,                     // Warn 5 min before timeout
    destroyAfterMs: 24 * 60 * 60 * 1000, // Destroy after 24 hours
    checkIntervalMs: 60 * 1000,           // Check every minute
  });

  idleMonitor.setWarningCallback((sessionId, minutesRemaining) => {
    const ws = wsConnections.get(sessionId);
    if (ws) {
      try {
        ws.send(JSON.stringify({
          type: 'idle_warning',
          minutes_remaining: minutesRemaining,
        }));
      } catch {
        // Connection may be closed
      }
    }
  });

  idleMonitor.start();

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
    const { model: reqModel, repo_url, branch } = body as {
      model?: string;
      repo_url?: string;
      branch?: string;
    };
    const model = reqModel ?? serverSettings.provider.model;
    const sessionId = `ses_${crypto.randomUUID().slice(0, 8)}`;

    try {
      // Fetch secrets to inject as environment variables
      const repoScope = repo_url ?? 'global';
      const globalSecrets = secretsStore.listByRepo('global');
      const repoSecrets = repoScope !== 'global'
        ? secretsStore.listByRepo(repoScope)
        : [];

      // Merge: repo-scoped secrets override global ones with the same key
      const secretsMap = new Map<string, string>();
      for (const s of globalSecrets) secretsMap.set(s.key, s.value);
      for (const s of repoSecrets) secretsMap.set(s.key, s.value);

      const envVars = Array.from(secretsMap.entries()).map(
        ([key, value]) => `${key}=${value}`,
      );

      if (envVars.length > 0) {
        console.log('Injecting secrets:', envVars.map((e) => e.split('=')[0]));
      }

      const containerInfo = await containerManager.create({
        sessionId,
        image: serverSettings.docker.image !== 'forge-sandbox:base' ? serverSettings.docker.image : undefined,
        cpuLimit: serverSettings.docker.cpuLimit,
        memoryLimit: serverSettings.docker.memoryLimitGb * 1024 * 1024 * 1024,
        env: envVars.length > 0 ? envVars : undefined,
      });

      // Run health check
      const health = await containerManager.healthCheck(containerInfo.containerId);
      if (!health.healthy) {
        await containerManager.destroy(containerInfo.containerId);
        return c.json({ error: { code: 'CONTAINER_ERROR', message: 'Health check failed' } }, 500);
      }

      // Clone repo into workspace if repo_url was provided
      if (repo_url) {
        const cloneCmd = branch
          ? `cd /workspace && git clone --branch ${JSON.stringify(branch)} --single-branch ${JSON.stringify(repo_url)} .`
          : `cd /workspace && git clone ${JSON.stringify(repo_url)} .`;

        const cloneResult = await containerManager.exec(containerInfo.containerId, cloneCmd, {
          timeoutMs: 120_000,
        });

        if (cloneResult.exitCode !== 0) {
          await containerManager.destroy(containerInfo.containerId);
          return c.json({
            error: {
              code: 'CONTAINER_ERROR',
              message: `Failed to clone repo: ${cloneResult.stderr.trim()}`,
            },
          }, 500);
        }
      }

      // Generate repo map in background (don't block session creation)
      const repoKey = repo_url ?? sessionId;
      void containerManager.exec(containerInfo.containerId, 'ls /workspace').then(async (lsResult) => {
        if (lsResult.exitCode === 0 && lsResult.stdout.trim().length > 0) {
          try {
            await repoMapGenerator.generate(
              containerInfo.containerId,
              containerManager,
              '/workspace',
              repoMapStore,
              repoKey,
            );
          } catch (err) {
            console.warn('Repo map generation failed (non-fatal):', err);
          }
        }
      }).catch((err) => { console.warn('Repo map ls check failed (non-fatal):', err); });

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
        repo: repo_url,
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
            repo_url: session.repo ?? null,
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
      let messageCount = 0;
      if (row.history_json) {
        try {
          const history = JSON.parse(row.history_json);
          messageCount = Array.isArray(history) ? history.length : 0;
        } catch { /* ignore parse errors */ }
      }
      return {
        id: row.id,
        status: live?.status ?? row.status,
        model: row.model,
        container_id: row.container_id,
        created_at: row.created_at,
        updated_at: row.updated_at,
        last_active_at: row.last_active_at,
        message_count: messageCount,
        context_summary: row.context_summary ?? null,
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

  // Write file content to sandbox container
  app.put('/api/sessions/:id/files/write', async (c) => {
    const id = c.req.param('id');
    const session = sessions.get(id);
    if (!session) {
      return c.json({ error: { code: 'SESSION_NOT_FOUND', message: 'Session not found' } }, 404);
    }

    const body = await c.req.json().catch(() => ({}));
    const { path, content } = body as { path?: string; content?: string };

    if (!path || content === undefined) {
      return c.json({ error: { code: 'VALIDATION_ERROR', message: 'path and content are required' } }, 400);
    }

    // Path traversal protection
    if (!path.startsWith('/workspace') || path.includes('..')) {
      return c.json({ error: { code: 'VALIDATION_ERROR', message: 'Path must be within /workspace and cannot contain ..' } }, 400);
    }

    try {
      // Use base64 encoding for robust content transfer (avoids heredoc issues)
      const base64Content = Buffer.from(content, 'utf-8').toString('base64');
      const writeResult = await containerManager.exec(
        session.containerId,
        `echo '${base64Content}' | base64 -d > ${JSON.stringify(path)}`,
        { timeoutMs: 10_000 },
      );

      if (writeResult.exitCode !== 0) {
        return c.json({
          error: { code: 'FILE_WRITE_ERROR', message: writeResult.stderr || 'Failed to write file' },
        }, 500);
      }

      return c.json({ success: true, path });
    } catch (err) {
      return c.json({
        error: {
          code: 'EXEC_ERROR',
          message: err instanceof Error ? err.message : 'Failed to write file',
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

    // Transform AI SDK ModelMessage[] into the flat format the UI expects
    function transformMessages(rawMessages: unknown[]): Array<{ id: string; role: string; content: string; timestamp: string }> {
      const result: Array<{ id: string; role: string; content: string; timestamp: string }> = [];
      for (const msg of rawMessages) {
        if (typeof msg !== 'object' || msg === null) continue;
        const m = msg as { role?: string; content?: unknown };
        if (!m.role) continue;

        // Skip tool messages — they're internal to the LLM conversation
        if (m.role === 'tool') continue;
        // Skip system messages (micro-step hints, context summaries)
        if (m.role === 'system') continue;

        // Extract text content from various formats
        let content = '';
        if (typeof m.content === 'string') {
          content = m.content;
        } else if (Array.isArray(m.content)) {
          // AI SDK structured content: [{ type: 'text', text: '...' }, { type: 'tool-call', ... }]
          const textParts: string[] = [];
          for (const part of m.content) {
            if (typeof part === 'object' && part !== null) {
              if ('text' in part && typeof (part as { text: string }).text === 'string') {
                textParts.push((part as { text: string }).text);
              }
            }
          }
          content = textParts.join('');
        }

        // Only include messages with actual text content
        if (content) {
          result.push({
            id: `hist_${result.length}`,
            role: m.role === 'assistant' ? 'assistant' : 'user',
            content,
            timestamp: new Date().toISOString(),
          });
        }
      }
      return result;
    }

    // If the session has a live agent loop, get messages from it
    if (session?.agentLoop) {
      const history = session.agentLoop.getHistory();
      const rawMessages = history.getMessages();
      const messages = transformMessages(rawMessages as unknown[]);
      return c.json({
        messages,
        total: messages.length,
        context_summary: history.getContextSummary(),
      });
    }

    // Otherwise, load from the database
    const historyJson = dbRow?.history_json ?? '[]';
    try {
      const rawMessages = JSON.parse(historyJson) as unknown[];
      const messages = transformMessages(rawMessages);
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
      const tokenBudget = isSmallModel(session.model)
        ? TokenBudget.forSmallModel(session.model)
        : TokenBudget.forModel(session.model);

      // Restore conversation history from DB (e.g., after session resume)
      let history: ConversationHistory | undefined;
      const dbRow = sessionStore.get(session.id);
      if (dbRow?.history_json && dbRow.history_json !== '[]') {
        try {
          const messages = JSON.parse(dbRow.history_json) as import('ai').ModelMessage[];
          if (Array.isArray(messages) && messages.length > 0) {
            history = new ConversationHistory({ messages });
          }
        } catch {
          // Invalid history — start fresh
        }
      }

      session.agentLoop = new AgentLoop(model, toolRegistry, containerManager, {
        tokenBudget,
        checkpointManager,
        modelName: session.model,
        history,
      });
    }

    try {
      // Inject knowledge context (rules, notes, session history, repo map) into system prompt
      let knowledgeContext = await knowledgeInjector.inject(
        session.containerId,
        session.repo ?? null,
        [],    // taskKeywords — simple extraction later
      );

      // Append checkpoint resume context if this is a resumed session
      if (session.resumeContext) {
        knowledgeContext = knowledgeContext
          ? `${knowledgeContext}\n\n${session.resumeContext}`
          : session.resumeContext;
        session.resumeContext = undefined; // Only inject once
      }

      const allToolSpecs = toolRegistry.list();
      // Filter tool names for small models so the prompt matches the AI SDK definitions
      const toolSpecs = isSmallModel(session.model)
        ? filterToolsForSmallModel(allToolSpecs)
        : allToolSpecs;
      const systemPrompt = buildSystemPrompt({
        toolNames: toolSpecs.map((t) => t.name),
        sessionId: session.id,
        knowledgeContext: knowledgeContext || undefined,
        isSmallModel: isSmallModel(session.model),
      });

      const events: unknown[] = [];
      for await (const event of session.agentLoop.run(content, {
        sessionId: session.id,
        containerId: session.containerId,
        model: session.model,
        systemPrompt,
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

    // Re-create a container for this session, reattaching the existing workspace volume if available
    try {
      const containerInfo = await containerManager.create({
        sessionId: id,
        existingVolume: dbRow.volume_name ?? undefined,
      });
      const health = await containerManager.healthCheck(containerInfo.containerId);
      if (!health.healthy) {
        await containerManager.destroy(containerInfo.containerId);
        return c.json({ error: { code: 'CONTAINER_ERROR', message: 'Health check failed on resume' } }, 500);
      }

      // Regenerate repo map in background on resume
      void containerManager.exec(containerInfo.containerId, 'ls /workspace').then(async (lsResult) => {
        if (lsResult.exitCode === 0 && lsResult.stdout.trim().length > 0) {
          try {
            await repoMapGenerator.generate(
              containerInfo.containerId,
              containerManager,
              '/workspace',
              repoMapStore,
              id,
            );
          } catch (err) {
            console.warn('Repo map generation on resume failed (non-fatal):', err);
          }
        }
      }).catch((err) => { console.warn('Repo map ls check on resume failed (non-fatal):', err); });

      // Update DB with new container
      sessionStore.update(id, {
        status: 'ready',
        containerId: containerInfo.containerId,
        volumeName: containerInfo.volumeName,
      });

      // Load checkpoint context if one exists (for injection into next system prompt)
      let resumeContext: string | undefined;
      const checkpoint = checkpointManager.loadCheckpoint(id);
      if (checkpoint) {
        resumeContext = checkpointManager.formatForResume(checkpoint);
      }

      // Hydrate in-memory state
      const session: SessionState = {
        id,
        containerId: containerInfo.containerId,
        model: dbRow.model,
        status: 'ready',
        createdAt: dbRow.created_at,
        volumeName: containerInfo.volumeName,
        resumeContext,
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
          history_length: (() => { try { const h = JSON.parse(dbRow.history_json); return Array.isArray(h) ? h.length : 0; } catch { return 0; } })(),
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

  // =====================================================
  // Knowledge Notes API
  // =====================================================

  // List knowledge notes (with optional repo and tag filters)
  app.get('/api/knowledge/notes', (c) => {
    const repo = c.req.query('repo');
    const search = c.req.query('search');

    let notes;
    if (search) {
      notes = knowledgeStore.search(repo ?? 'global', search);
    } else if (repo) {
      notes = knowledgeStore.listByRepo(repo);
    } else {
      notes = knowledgeStore.list();
    }

    // Parse tags from JSON strings for response
    const parsed = notes.map((n) => {
      let tags: string[] = [];
      try { tags = JSON.parse(n.tags) as string[]; } catch { /* corrupted tags */ }
      return { ...n, tags };
    });

    return c.json({ notes: parsed, total: parsed.length });
  });

  // Create a knowledge note
  app.post('/api/knowledge/notes', async (c) => {
    const rawBody = await c.req.json().catch(() => ({}));
    const parsed = CreateNoteSchema.safeParse(rawBody);
    if (!parsed.success) {
      return c.json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid note',
          details: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
        },
      }, 400);
    }

    const note = knowledgeStore.create({
      content: parsed.data.content,
      tags: parsed.data.tags,
      repoScope: parsed.data.repo_scope,
      source: parsed.data.source,
    });

    let noteTags: string[] = [];
    try { noteTags = JSON.parse(note.tags) as string[]; } catch { /* */ }
    return c.json({
      note: { ...note, tags: noteTags },
    }, 201);
  });

  // Delete a knowledge note
  app.delete('/api/knowledge/notes/:id', (c) => {
    const id = c.req.param('id');
    const deleted = knowledgeStore.delete(id);
    if (!deleted) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Note not found' } }, 404);
    }
    return c.json({ deleted: true });
  });

  // Get session history
  app.get('/api/knowledge/sessions', (c) => {
    const repo = c.req.query('repo');
    const search = c.req.query('search');

    let entries;
    if (search) {
      entries = sessionHistoryStore.search(search, repo ?? undefined);
    } else if (repo) {
      entries = sessionHistoryStore.listByRepo(repo);
    } else {
      entries = sessionHistoryStore.list();
    }

    const safeParse = (json: string): string[] => {
      try { return JSON.parse(json) as string[]; } catch { return []; }
    };
    const parsed = entries.map((e) => ({
      ...e,
      decisions_made: safeParse(e.decisions_made),
      files_modified: safeParse(e.files_modified),
      errors_hit: safeParse(e.errors_hit),
    }));

    return c.json({ sessions: parsed, total: parsed.length });
  });

  // =====================================================
  // Secrets API
  // =====================================================

  // List secrets for a repo (values redacted)
  app.get('/api/secrets/:repo', (c) => {
    const repo = decodeURIComponent(c.req.param('repo'));
    const secrets = secretsStore.listByRepo(repo);
    const redacted = secrets.map((s) => ({
      repo: s.repo,
      key: s.key,
      value: '••••••••',
      created_at: s.created_at,
    }));
    return c.json({ secrets: redacted, total: redacted.length });
  });

  // Set a secret
  app.put('/api/secrets/:repo/:key', async (c) => {
    const repo = decodeURIComponent(c.req.param('repo'));
    const key = c.req.param('key');
    const body = await c.req.json().catch(() => ({}));
    const value = (body as { value?: string }).value;

    if (!value) {
      return c.json({ error: { code: 'VALIDATION_ERROR', message: 'value is required' } }, 400);
    }

    secretsStore.set(repo, key, value);
    return c.json({ secret: { repo, key, value: '••••••••' } });
  });

  // Delete a secret
  app.delete('/api/secrets/:repo/:key', (c) => {
    const repo = decodeURIComponent(c.req.param('repo'));
    const key = c.req.param('key');
    const deleted = secretsStore.delete(repo, key);
    if (!deleted) {
      return c.json({ error: { code: 'NOT_FOUND', message: 'Secret not found' } }, 404);
    }
    return c.json({ deleted: true });
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
          checkpointStore,
          checkpointManager,
          knowledgeInjector,
          wsConnections,
          noteSuggester,
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

  return {
    app,
    sessions,
    containerManager,
    toolRegistry,
    sessionStore,
    settingsStore,
    knowledgeStore,
    sessionHistoryStore,
    repoMapStore,
    secretsStore,
    checkpointStore,
    knowledgeInjector,
    idleMonitor,
  };
}
