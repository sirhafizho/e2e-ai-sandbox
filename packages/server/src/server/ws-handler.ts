import type { WSContext } from 'hono/ws';
import type { ServerWebSocketEvent, ClientWebSocketEvent } from '@forge/shared';
import { ClientWebSocketEvent as ClientEventSchema } from '@forge/shared';
import { AgentLoop } from '../agent/agent-loop.js';
import { TokenBudget } from '../agent/token-budget.js';
import { ContainerManager } from '../sandbox/container-manager.js';
import { ToolRegistry } from '../tools/registry.js';
import { createProvider } from '../llm/provider.js';
import type { LLMProviderConfig } from '@forge/shared';

interface SessionState {
  id: string;
  containerId: string;
  model: string;
  status: 'created' | 'booting' | 'ready' | 'running' | 'terminated';
  agentLoop?: AgentLoop;
}

interface WsSessionDeps {
  sessions: Map<string, SessionState>;
  containerManager: ContainerManager;
  toolRegistry: ToolRegistry;
}

/**
 * Send a typed server event over WebSocket.
 */
function send(ws: WSContext, event: ServerWebSocketEvent): void {
  ws.send(JSON.stringify(event));
}

/**
 * Create a WebSocket message handler for a session.
 * Returns the handlers expected by Hono's upgradeWebSocket.
 */
export function createWsHandlers(sessionId: string, deps: WsSessionDeps) {
  let abortController: AbortController | null = null;
  let heartbeatInterval: ReturnType<typeof setInterval> | null = null;

  return {
    onOpen(_event: Event, ws: WSContext) {
      const session = deps.sessions.get(sessionId);
      if (!session) {
        send(ws, { type: 'error', code: 'SESSION_NOT_FOUND', message: 'Session not found' });
        ws.close(4004, 'Session not found');
        return;
      }

      // Send greeting
      send(ws, { type: 'greeting', message: `Session ${sessionId} connected` });
      send(ws, {
        type: 'session_status',
        status: session.status as 'ready',
        info: 'Connected',
      });

      // Start heartbeat (ping every 30s)
      heartbeatInterval = setInterval(() => {
        try {
          ws.send(JSON.stringify({ type: 'ping' }));
        } catch {
          // Connection may be closed
        }
      }, 30_000);
    },

    async onMessage(event: MessageEvent, ws: WSContext) {
      const session = deps.sessions.get(sessionId);
      if (!session) {
        send(ws, { type: 'error', code: 'SESSION_NOT_FOUND', message: 'Session not found' });
        return;
      }

      let parsed: ClientWebSocketEvent;
      try {
        const raw = JSON.parse(typeof event.data === 'string' ? event.data : String(event.data));
        parsed = ClientEventSchema.parse(raw);
      } catch {
        send(ws, { type: 'error', code: 'INVALID_MESSAGE', message: 'Invalid message format' });
        return;
      }

      switch (parsed.type) {
        case 'user_message': {
          if (session.status === 'running') {
            send(ws, {
              type: 'error',
              code: 'SESSION_BUSY',
              message: 'Agent is already processing a message',
            });
            return;
          }

          // Lazily create agent loop
          if (!session.agentLoop) {
            const providerConfig: LLMProviderConfig = {
              type: 'ollama',
              model: session.model,
            };
            const model = createProvider(providerConfig);
            session.agentLoop = new AgentLoop(model, deps.toolRegistry, deps.containerManager, {
              tokenBudget: TokenBudget.forModel(session.model),
            });
          }

          session.status = 'running';
          send(ws, { type: 'session_status', status: 'running', info: 'Processing message' });

          abortController = new AbortController();
          const messageId = `msg_${crypto.randomUUID().slice(0, 8)}`;

          try {
            for await (const agentEvent of session.agentLoop.run(parsed.content, {
              sessionId: session.id,
              containerId: session.containerId,
              model: session.model,
            }, { abortSignal: abortController.signal })) {
              // Map internal agent events to spec WebSocket events
              switch (agentEvent.type) {
                case 'agent_message': {
                  const data = agentEvent.data as { content: string; done: boolean };
                  if (data.content || data.done) {
                    send(ws, {
                      type: 'agent_message',
                      content: data.content,
                      role: 'assistant',
                      message_id: messageId,
                      done: data.done,
                    });
                  }
                  break;
                }
                case 'tool_start': {
                  const data = agentEvent.data as {
                    callId: string;
                    toolName: string;
                    inputSummary: string;
                  };
                  send(ws, {
                    type: 'tool_start',
                    call_id: data.callId,
                    tool_name: data.toolName,
                    input_summary: data.inputSummary,
                  });
                  break;
                }
                case 'tool_complete': {
                  const data = agentEvent.data as {
                    callId: string;
                    output: unknown;
                    durationMs: number;
                    isError: boolean;
                  };
                  if (data.isError) {
                    send(ws, {
                      type: 'tool_error',
                      call_id: data.callId,
                      error: String(data.output),
                      code: 'TOOL_EXEC_ERROR',
                      retrying: false,
                    });
                  } else {
                    send(ws, {
                      type: 'tool_complete',
                      call_id: data.callId,
                      result: typeof data.output === 'object' && data.output !== null
                        ? (data.output as Record<string, unknown>)
                        : { output: data.output },
                      duration_ms: data.durationMs,
                    });
                  }
                  break;
                }
                case 'tool_error': {
                  const data = agentEvent.data as { error: string };
                  send(ws, {
                    type: 'tool_error',
                    call_id: 'unknown',
                    error: data.error,
                    code: 'TOOL_ERROR',
                    retrying: false,
                  });
                  break;
                }
                case 'token_budget': {
                  const data = agentEvent.data as {
                    level: string;
                    usageRatio: number;
                    used: number;
                    remaining: number;
                    usableBudget: number;
                  };
                  send(ws, {
                    type: 'token_budget',
                    level: data.level as 'normal' | 'warning' | 'critical' | 'emergency',
                    usage_ratio: data.usageRatio,
                    used: data.used,
                    remaining: data.remaining,
                    usable_budget: data.usableBudget,
                  });
                  break;
                }
                case 'context_windowed': {
                  const data = agentEvent.data as {
                    evictedMessages: number;
                    tokensFreed: number;
                    newLevel: string;
                  };
                  send(ws, {
                    type: 'context_windowed',
                    evicted_messages: data.evictedMessages,
                    tokens_freed: data.tokensFreed,
                    new_level: data.newLevel as 'normal' | 'warning' | 'critical' | 'emergency',
                  });
                  break;
                }
                case 'done':
                  break;
              }
            }
          } catch (err) {
            if ((err as Error).name === 'AbortError') {
              send(ws, {
                type: 'session_status',
                status: 'ready',
                info: 'Cancelled',
              });
            } else {
              send(ws, {
                type: 'error',
                code: 'LLM_ERROR',
                message: err instanceof Error ? err.message : 'Agent loop failed',
              });
            }
          } finally {
            session.status = 'ready';
            abortController = null;
            send(ws, { type: 'session_status', status: 'ready', info: 'Idle' });
          }
          break;
        }

        case 'cancel': {
          if (abortController) {
            abortController.abort();
            send(ws, { type: 'session_status', status: 'ready', info: 'Cancelling...' });
          }
          break;
        }
      }
    },

    onClose() {
      if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
        heartbeatInterval = null;
      }
      if (abortController) {
        abortController.abort();
        abortController = null;
      }
    },

    onError(error: Event) {
      console.error(`WebSocket error for session ${sessionId}:`, error);
      if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
        heartbeatInterval = null;
      }
    },
  };
}
