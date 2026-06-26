import { useEffect, useRef, useState } from 'react';
import { Terminal as XTerm } from 'xterm';
import { FitAddon } from '@xterm/addon-fit';
import { Terminal, Plus } from 'lucide-react';
import 'xterm/css/xterm.css';

interface TerminalPanelProps {
  sessionId: string | null;
}

export function TerminalPanel({ sessionId }: TerminalPanelProps) {
  const termRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const [connected, setConnected] = useState(false);
  const [shellId] = useState('default');

  useEffect(() => {
    if (!termRef.current || !sessionId) return;

    const term = new XTerm({
      theme: {
        background: '#09090b',
        foreground: '#d4d4d8',
        cursor: '#3b82f6',
        selectionBackground: '#3b82f640',
        black: '#27272a',
        red: '#ef4444',
        green: '#22c55e',
        yellow: '#f59e0b',
        blue: '#3b82f6',
        magenta: '#a855f7',
        cyan: '#06b6d4',
        white: '#d4d4d8',
      },
      fontFamily: '"JetBrains Mono", "Fira Code", "Cascadia Code", monospace',
      fontSize: 13,
      lineHeight: 1.4,
      cursorBlink: true,
      scrollback: 10_000,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(termRef.current);
    fitAddon.fit();

    xtermRef.current = term;
    fitAddonRef.current = fitAddon;

    // Connect to terminal WebSocket
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/sessions/${sessionId}/terminal/${shellId}`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      term.writeln('\x1b[2m--- Terminal connected ---\x1b[0m');
    };

    ws.onmessage = (event) => {
      term.write(event.data as string);
    };

    ws.onclose = () => {
      setConnected(false);
      term.writeln('\x1b[2m--- Terminal disconnected ---\x1b[0m');
    };

    // Send user input to WebSocket
    term.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'terminal_input', data: { shell_id: shellId, input: data } }));
      }
    });

    // Handle resize — refit terminal and send dimensions to server
    const resizeObserver = new ResizeObserver(() => {
      fitAddon.fit();
      const { cols, rows } = term;
      if (ws.readyState === WebSocket.OPEN && cols > 0 && rows > 0) {
        ws.send(JSON.stringify({ type: 'resize', cols, rows }));
      }
    });
    resizeObserver.observe(termRef.current);

    return () => {
      resizeObserver.disconnect();
      ws.close();
      term.dispose();
      xtermRef.current = null;
      wsRef.current = null;
      fitAddonRef.current = null;
    };
  }, [sessionId, shellId]);

  if (!sessionId) {
    return (
      <div className="flex h-full flex-col items-center justify-center bg-zinc-950 text-zinc-600">
        <Terminal className="mb-2 h-8 w-8" />
        <span className="text-sm">No session active</span>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-[#09090b]">
      {/* Tab bar */}
      <div className="flex items-center border-b border-zinc-800 bg-zinc-900/50 px-2">
        <div className="flex items-center gap-1 px-3 py-1.5 text-xs">
          <Terminal className="h-3 w-3 text-zinc-500" />
          <span className="text-zinc-300">Terminal</span>
          <span
            className={`ml-1 h-1.5 w-1.5 rounded-full ${
              connected ? 'bg-green-400' : 'bg-zinc-600'
            }`}
          />
        </div>
        <button
          className="ml-auto flex items-center gap-1 rounded px-2 py-1 text-xs text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
          title="New shell tab (coming soon)"
        >
          <Plus className="h-3 w-3" />
        </button>
      </div>

      {/* Terminal */}
      <div ref={termRef} className="flex-1 p-1" />
    </div>
  );
}
