import { useParams } from 'react-router-dom';
import { useEffect, useRef, useCallback } from 'react';
import { WorkspaceLayout } from '../components/layout/WorkspaceLayout.js';
import { ChatPanel } from '../components/chat/ChatPanel.js';
import { useSessionStore } from '../lib/store.js';
import { ForgeWebSocket } from '../lib/websocket.js';
import { Terminal, Globe, FolderTree } from 'lucide-react';

export function SessionPage() {
  const { id } = useParams<{ id: string }>();
  const wsRef = useRef<ForgeWebSocket | null>(null);
  const { setSessionId, addMessage, setToolCall, updateToolCall, setTodos, setAgentWorking, setStatus, clearSession } =
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

    ws.connect();

    return () => {
      ws.disconnect();
      wsRef.current = null;
      clearSession();
    };
  }, [id, setSessionId, addMessage, setToolCall, updateToolCall, setTodos, setAgentWorking, setStatus, clearSession]);

  return (
    <WorkspaceLayout
      chatPanel={
        <ChatPanel
          onSendMessage={handleSendMessage}
          onCancel={handleCancel}
        />
      }
      terminalPanel={<PlaceholderPanel icon={Terminal} label="Terminal" />}
      browserPanel={<PlaceholderPanel icon={Globe} label="Browser" />}
      filePanel={<PlaceholderPanel icon={FolderTree} label="Files" />}
    />
  );
}

function PlaceholderPanel({
  icon: Icon,
  label,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center border-b border-zinc-800 bg-zinc-950/50 text-zinc-600">
      <Icon className="mb-2 h-8 w-8" />
      <span className="text-sm">{label}</span>
      <span className="mt-1 text-xs text-zinc-700">Coming soon</span>
    </div>
  );
}
