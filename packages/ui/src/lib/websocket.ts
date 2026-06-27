export type WSEventType =
  | 'greeting'
  | 'agent_message'
  | 'tool_start'
  | 'tool_output'
  | 'tool_complete'
  | 'tool_error'
  | 'todo_update'
  | 'session_status'
  | 'idle_warning'
  | 'browser_screenshot'
  | 'error';

export interface WSEvent {
  type: WSEventType;
  data: Record<string, unknown>;
  timestamp?: string;
}

export interface WSClientMessage {
  type: 'user_message' | 'cancel' | 'terminal_input';
  data: Record<string, unknown>;
}

export class ForgeWebSocket {
  private ws: WebSocket | null = null;
  private url: string;
  private handlers = new Map<string, Array<(data: Record<string, unknown>) => void>>();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempt = 0;
  private maxReconnectAttempts = 5;
  private _connected = false;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private lastPongTime = 0;
  private static readonly HEARTBEAT_INTERVAL = 30_000; // 30s
  private static readonly HEARTBEAT_TIMEOUT = 10_000;  // 10s grace for pong

  constructor(sessionId: string) {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    this.url = `${protocol}//${window.location.host}/ws/sessions/${sessionId}`;
  }

  get connected(): boolean {
    return this._connected;
  }

  connect(): void {
    if (this.ws) return;

    this.ws = new WebSocket(this.url);

    this.ws.onopen = () => {
      this._connected = true;
      this.reconnectAttempt = 0;
      this.lastPongTime = Date.now();
      this.startHeartbeat();
      this.emit('_connected', {});
    };

    this.ws.onmessage = (event) => {
      // Any message from server counts as a pong (connection is alive)
      this.lastPongTime = Date.now();
      try {
        const msg = JSON.parse(event.data as string) as WSEvent;
        this.emit(msg.type, msg.data);
      } catch {
        // Ignore malformed messages (including pong frames)
      }
    };

    this.ws.onclose = () => {
      this._connected = false;
      this.ws = null;
      this.stopHeartbeat();
      this.emit('_disconnected', {});
      this.scheduleReconnect();
    };

    this.ws.onerror = () => {
      this._connected = false;
    };
  }

  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.stopHeartbeat();
    this.maxReconnectAttempts = 0; // Prevent reconnection
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this._connected = false;
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

      // If we haven't heard from the server in too long, connection is dead
      const elapsed = Date.now() - this.lastPongTime;
      if (elapsed > ForgeWebSocket.HEARTBEAT_INTERVAL + ForgeWebSocket.HEARTBEAT_TIMEOUT) {
        console.warn('WebSocket heartbeat timeout — forcing reconnect');
        this.ws.close();
        return;
      }

      // Send a ping (JSON message the server can echo or just treat as keep-alive)
      try {
        this.ws.send(JSON.stringify({ type: 'ping' }));
      } catch {
        // Connection may be closing
      }
    }, ForgeWebSocket.HEARTBEAT_INTERVAL);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  send(message: WSClientMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  sendMessage(content: string): void {
    this.send({ type: 'user_message', data: { content } });
  }

  sendCancel(): void {
    this.send({ type: 'cancel', data: {} });
  }

  on(event: string, handler: (data: Record<string, unknown>) => void): () => void {
    const handlers = this.handlers.get(event) ?? [];
    handlers.push(handler);
    this.handlers.set(event, handlers);

    // Return unsubscribe function
    return () => {
      const current = this.handlers.get(event) ?? [];
      this.handlers.set(
        event,
        current.filter((h) => h !== handler),
      );
    };
  }

  private emit(event: string, data: Record<string, unknown>): void {
    const handlers = this.handlers.get(event) ?? [];
    for (const handler of handlers) {
      handler(data);
    }
    // Also emit to wildcard listeners
    const wildcardHandlers = this.handlers.get('*') ?? [];
    for (const handler of wildcardHandlers) {
      handler({ type: event, ...data });
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempt >= this.maxReconnectAttempts) return;

    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempt), 30_000);
    this.reconnectAttempt++;

    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, delay);
  }
}
