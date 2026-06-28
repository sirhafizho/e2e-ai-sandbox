import { useParams } from 'react-router-dom';
import { lazy, Suspense, useEffect, useRef, useCallback } from 'react';
import { WorkspaceLayout } from '../components/layout/WorkspaceLayout.js';
import { ChatPanel } from '../components/chat/ChatPanel.js';
import { FilePanel } from '../components/files/FilePanel.js';
import { BrowserPanel } from '../components/browser/BrowserPanel.js';
import { ErrorBoundary } from '../components/ErrorBoundary.js';
import { useSessionStore } from '../lib/store.js';
import { ForgeWebSocket } from '../lib/websocket.js';
import { api } from '../lib/api.js';

// Lazy-load TerminalPanel (xterm.js ~100KB)
const TerminalPanel = lazy(() =>
  import('../components/terminal/TerminalPanel.js').then((m) => ({ default: m.TerminalPanel })),
);

function PanelLoader() {
  return (
    <div className="flex h-full items-center justify-center bg-zinc-950">
      <div className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-700 border-t-zinc-400" />
    </div>
  );
}

export function SessionPage() {
  const { id } = useParams<{ id: string }>();
  const wsRef = useRef<ForgeWebSocket | null>(null);
  const { setSessionId, addMessage, appendToMessage, finalizeStreaming, setMessages, setToolCall, updateToolCall, setTodos, setAgentWorking, setStatus, setBrowserScreenshot, clearSession, clearToolCalls } =
    useSessionStore();

  const handleSendMessage = useCallback(
    (content: string) => {
      if (!wsRef.current) return;

      // Clear stale tool calls from the previous turn
      clearToolCalls();

      // Add user message to store
      addMessage({
        id: crypto.randomUUID(),
        role: 'user',
        content,
        timestamp: new Date().toISOString(),
      });

      // Send via WebSocket
      wsRef.current.sendMessage(content);
      setAgentWorking(true);
    },
    [addMessage, setAgentWorking, clearToolCalls],
  );

  const handleCancel = useCallback(() => {
    wsRef.current?.sendCancel();
  }, []);

  useEffect(() => {
    if (!id) return;

    setSessionId(id);
    const ws = new ForgeWebSocket(id);
    wsRef.current = ws;

    const unsubs: Array<() => void> = [];

    unsubs.push(ws.on('greeting', (data) => {
      addMessage({
        id: crypto.randomUUID(),
        role: 'assistant',
        content: (data.message as string) ?? 'Session connected.',
        timestamp: new Date().toISOString(),
      });
    }));

    let streamingMessageId: string | null = null;
    unsubs.push(ws.on('agent_message', (data) => {
      const done = (data.done as boolean) ?? false;
      const content = (data.content as string) ?? '';

      if (done) {
        // Finalize: mark the streaming message as complete
        if (streamingMessageId) {
          if (content) appendToMessage(streamingMessageId, content);
          finalizeStreaming();
        }
        streamingMessageId = null;
        setAgentWorking(false);
      } else if (streamingMessageId) {
        // Append to existing streaming message
        appendToMessage(streamingMessageId, content);
      } else {
        // Start a new streaming message
        streamingMessageId = crypto.randomUUID();
        addMessage({
          id: streamingMessageId,
          role: 'assistant',
          content,
          streaming: true,
          timestamp: new Date().toISOString(),
        });
      }
    }));

    unsubs.push(ws.on('tool_start', (data) => {
      setToolCall({
        callId: data.call_id as string,
        toolName: data.tool_name as string,
        input: { summary: data.input_summary as string },
        status: 'running',
      });
    }));

    unsubs.push(ws.on('tool_complete', (data) => {
      updateToolCall(data.call_id as string, {
        status: 'complete',
        output: data.result,
        durationMs: data.duration_ms as number,
      });
    }));

    unsubs.push(ws.on('tool_error', (data) => {
      updateToolCall(data.call_id as string, {
        status: 'error',
        output: data.error,
        isError: true,
      });
    }));

    unsubs.push(ws.on('todo_update', (data) => {
      const todos = data.todos as Array<{ content: string; status: string }>;
      setTodos(
        todos.map((t) => ({
          content: t.content,
          status: t.status as 'pending' | 'in_progress' | 'completed',
        })),
      );
    }));

    unsubs.push(ws.on('session_status', (data) => {
      setStatus(data.status as string);
    }));

    unsubs.push(ws.on('browser_screenshot', (data) => {
      setBrowserScreenshot(
        (data.screenshot as string) ?? null,
        data.url as string | undefined,
      );
    }));

    unsubs.push(ws.on('token_budget', (data) => {
      const level = data.level as string;
      if (level === 'critical' || level === 'emergency') {
        addMessage({
          id: crypto.randomUUID(),
          role: 'system',
          content: `Context ${level}: ${Math.round((data.usage_ratio as number) * 100)}% of token budget used. ${level === 'emergency' ? 'Checkpointing context.' : 'Older context will be summarized.'}`,
          timestamp: new Date().toISOString(),
        });
      }
    }));

    unsubs.push(ws.on('idle_warning', (data) => {
      addMessage({
        id: crypto.randomUUID(),
        role: 'system',
        content: `Session will be paused in ${data.minutes_remaining} minute(s) due to inactivity.`,
        timestamp: new Date().toISOString(),
      });
    }));

    unsubs.push(ws.on('error', (data) => {
      addMessage({
        id: crypto.randomUUID(),
        role: 'system',
        content: `Error: ${data.message ?? data.error ?? 'Unknown error'}`,
        timestamp: new Date().toISOString(),
      });
    }));

    // Load persisted message history before connecting WebSocket
    api.sessions.messages(id).then((res) => {
      if (res.messages.length > 0) {
        setMessages(
          res.messages.map((m) => ({
            id: m.id,
            role: m.role as 'user' | 'assistant' | 'system',
            content: m.content,
            timestamp: m.timestamp,
          })),
        );
      }
    }).catch(() => {
      // History may not be available — that's fine
    });

    ws.connect();

    return () => {
      for (const unsub of unsubs) unsub();
      ws.disconnect();
      wsRef.current = null;
      clearSession();
    };
  }, [id, setSessionId, addMessage, appendToMessage, finalizeStreaming, setMessages, setToolCall, updateToolCall, setTodos, setAgentWorking, setStatus, setBrowserScreenshot, clearSession, clearToolCalls]);

  return (
    <WorkspaceLayout
      chatPanel={
        <ChatPanel
          onSendMessage={handleSendMessage}
          onCancel={handleCancel}
        />
      }
      terminalPanel={
        <ErrorBoundary label="Terminal">
          <Suspense fallback={<PanelLoader />}>
            <TerminalPanel sessionId={id ?? null} />
          </Suspense>
        </ErrorBoundary>
      }
      browserPanel={<BrowserPanel sessionId={id ?? null} />}
      filePanel={<FilePanel sessionId={id ?? null} />}
    />
  );
}
