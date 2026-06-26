import { useParams } from 'react-router-dom';
import { useEffect, useRef, useCallback } from 'react';
import { WorkspaceLayout } from '../components/layout/WorkspaceLayout.js';
import { ChatPanel } from '../components/chat/ChatPanel.js';
import { TerminalPanel } from '../components/terminal/TerminalPanel.js';
import { FilePanel } from '../components/files/FilePanel.js';
import { BrowserPanel } from '../components/browser/BrowserPanel.js';
import { useSessionStore } from '../lib/store.js';
import { ForgeWebSocket } from '../lib/websocket.js';
import { api } from '../lib/api.js';

export function SessionPage() {
  const { id } = useParams<{ id: string }>();
  const wsRef = useRef<ForgeWebSocket | null>(null);
  const { setSessionId, addMessage, setMessages, setToolCall, updateToolCall, setTodos, setAgentWorking, setStatus, setBrowserScreenshot, clearSession } =
    useSessionStore();

  const handleSendMessage = useCallback(
    (content: string) => {
      if (!wsRef.current) return;

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
    [addMessage, setAgentWorking],
  );

  const handleCancel = useCallback(() => {
    wsRef.current?.sendCancel();
  }, []);

  useEffect(() => {
    if (!id) return;

    setSessionId(id);
    const ws = new ForgeWebSocket(id);
    wsRef.current = ws;

    ws.on('greeting', (data) => {
      addMessage({
        id: crypto.randomUUID(),
        role: 'assistant',
        content: (data.message as string) ?? 'Session connected.',
        timestamp: new Date().toISOString(),
      });
    });

    ws.on('agent_message', (data) => {
      addMessage({
        id: crypto.randomUUID(),
        role: 'assistant',
        content: (data.content as string) ?? '',
        streaming: (data.streaming as boolean) ?? false,
        timestamp: new Date().toISOString(),
      });
      if (!(data.streaming as boolean)) {
        setAgentWorking(false);
      }
    });

    ws.on('tool_start', (data) => {
      setToolCall({
        callId: data.call_id as string,
        toolName: data.tool_name as string,
        input: (data.tool_input as Record<string, unknown>) ?? {},
        status: 'running',
      });
    });

    ws.on('tool_output', (data) => {
      updateToolCall(data.call_id as string, {
        output: data.output,
        isError: data.is_error as boolean,
      });
    });

    ws.on('tool_complete', (data) => {
      updateToolCall(data.call_id as string, {
        status: 'complete',
        durationMs: data.duration_ms as number,
      });
    });

    ws.on('tool_error', (data) => {
      updateToolCall(data.call_id as string, {
        status: 'error',
        output: data.error,
        isError: true,
      });
    });

    ws.on('todo_update', (data) => {
      const todos = data.todos as Array<{ content: string; status: string }>;
      setTodos(
        todos.map((t) => ({
          content: t.content,
          status: t.status as 'pending' | 'in_progress' | 'completed',
        })),
      );
    });

    ws.on('session_status', (data) => {
      setStatus(data.status as string);
    });

    ws.on('browser_screenshot', (data) => {
      setBrowserScreenshot(
        (data.screenshot as string) ?? null,
        data.url as string | undefined,
      );
    });

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
      ws.disconnect();
      wsRef.current = null;
      clearSession();
    };
  }, [id, setSessionId, addMessage, setMessages, setToolCall, updateToolCall, setTodos, setAgentWorking, setStatus, setBrowserScreenshot, clearSession]);

  return (
    <WorkspaceLayout
      chatPanel={
        <ChatPanel
          onSendMessage={handleSendMessage}
          onCancel={handleCancel}
        />
      }
      terminalPanel={<TerminalPanel sessionId={id ?? null} />}
      browserPanel={<BrowserPanel sessionId={id ?? null} />}
      filePanel={<FilePanel sessionId={id ?? null} />}
    />
  );
}
