import type { WSContext } from 'hono/ws';
import { ContainerManager } from '../sandbox/container-manager.js';

interface SessionState {
  id: string;
  containerId: string;
  status: string;
}

interface TerminalDeps {
  sessions: Map<string, SessionState>;
  containerManager: ContainerManager;
}

/**
 * Track active terminal sessions per container.
 * Key: `${sessionId}:${shellId}` → PTY stream + resize handle + active WebSocket.
 */
const activeTerminals = new Map<
  string,
  {
    stream: NodeJS.ReadWriteStream;
    resize: (cols: number, rows: number) => Promise<void>;
    activeWs: WSContext | null;
  }
>();

/**
 * Create WebSocket handlers for an interactive terminal PTY.
 *
 * Protocol:
 *   Client -> Server:
 *     - Raw text: written directly to PTY stdin
 *     - JSON `{ type: "resize", cols, rows }`: resize the PTY
 *   Server -> Client:
 *     - Raw text: PTY stdout/stderr (with ANSI escape codes)
 */
export function createTerminalHandlers(
  sessionId: string,
  shellId: string,
  deps: TerminalDeps,
) {
  const termKey = `${sessionId}:${shellId}`;

  return {
    async onOpen(_event: Event, ws: WSContext) {
      const session = deps.sessions.get(sessionId);
      if (!session) {
        ws.send('\r\n\x1b[31mError: Session not found\x1b[0m\r\n');
        ws.close(4004, 'Session not found');
        return;
      }

      try {
        // Reuse existing terminal or create a new one
        let terminal = activeTerminals.get(termKey);

        if (!terminal) {
          const pty = await deps.containerManager.execInteractive(session.containerId, {
            cols: 80,
            rows: 24,
          });

          terminal = {
            stream: pty.stream,
            resize: pty.resize,
            activeWs: ws,
          };
          activeTerminals.set(termKey, terminal);

          // Pipe PTY output to the currently active WebSocket
          pty.stream.on('data', (data: Buffer) => {
            const t = activeTerminals.get(termKey);
            if (!t?.activeWs) return;
            try {
              t.activeWs.send(data.toString('utf-8'));
            } catch {
              // WebSocket may be closed
            }
          });

          // Clean up when the PTY stream ends
          pty.stream.on('end', () => {
            const t = activeTerminals.get(termKey);
            activeTerminals.delete(termKey);
            if (t?.activeWs) {
              try {
                t.activeWs.send('\r\n\x1b[2m--- Shell exited ---\x1b[0m\r\n');
                t.activeWs.close(1000, 'Shell exited');
              } catch {
                // Already closed
              }
            }
          });

          pty.stream.on('error', () => {
            activeTerminals.delete(termKey);
          });
        } else {
          // Existing terminal — update the active WebSocket so output goes to the new client
          terminal.activeWs = ws;
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to create terminal';
        ws.send(`\r\n\x1b[31mError: ${msg}\x1b[0m\r\n`);
        ws.close(4500, 'Terminal creation failed');
      }
    },

    onMessage(event: MessageEvent, _ws: WSContext) {
      const terminal = activeTerminals.get(termKey);
      if (!terminal) return;

      const raw = typeof event.data === 'string' ? event.data : String(event.data);

      // Check if it's a JSON control message (resize)
      if (raw.startsWith('{')) {
        try {
          const msg = JSON.parse(raw) as { type?: string; cols?: number; rows?: number; shell_id?: string; input?: string };
          if (msg.type === 'resize' && msg.cols && msg.rows) {
            terminal.resize(msg.cols, msg.rows).catch(() => {});
            return;
          }
          // Handle the format the UI sends: { type: 'terminal_input', data: { shell_id, input } }
          if (msg.type === 'terminal_input') {
            const input = msg.input ?? (msg as Record<string, unknown> & { data?: { input?: string } }).data?.input;
            if (input) {
              terminal.stream.write(input);
            }
            return;
          }
        } catch {
          // Not JSON, treat as raw terminal input
        }
      }

      // Raw terminal input — write directly to PTY
      terminal.stream.write(raw);
    },

    onClose() {
      // Clear active WebSocket reference so output isn't sent to a closed connection
      const terminal = activeTerminals.get(termKey);
      if (terminal) {
        terminal.activeWs = null;
      }
    },

    onError(error: Event) {
      console.error(`Terminal WebSocket error for ${termKey}:`, error);
      const terminal = activeTerminals.get(termKey);
      if (terminal) {
        terminal.activeWs = null;
      }
    },
  };
}

/**
 * Clean up all terminals for a session.
 */
export function destroySessionTerminals(sessionId: string): void {
  for (const [key, terminal] of activeTerminals) {
    if (key.startsWith(`${sessionId}:`)) {
      try {
        terminal.stream.end();
      } catch {
        // Stream may already be closed
      }
      activeTerminals.delete(key);
    }
  }
}
