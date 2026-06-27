import { useEffect, useRef, useState, useCallback } from 'react';
import { Terminal as XTerm } from 'xterm';
import { FitAddon } from '@xterm/addon-fit';
import { Terminal, Plus, X } from 'lucide-react';
import 'xterm/css/xterm.css';

interface TerminalPanelProps {
  sessionId: string | null;
}

interface ShellTab {
  id: string;
  label: string;
  term: XTerm | null;
  fitAddon: FitAddon | null;
  ws: WebSocket | null;
  connected: boolean;
}

const XTERM_THEME = {
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
};

const MAX_TABS = 5;

function createTerminal(): { term: XTerm; fitAddon: FitAddon } {
  const term = new XTerm({
    theme: XTERM_THEME,
    fontFamily: '"JetBrains Mono", "Fira Code", "Cascadia Code", monospace',
    fontSize: 13,
    lineHeight: 1.4,
    cursorBlink: true,
    scrollback: 10_000,
  });
  const fitAddon = new FitAddon();
  term.loadAddon(fitAddon);
  return { term, fitAddon };
}

export function TerminalPanel({ sessionId }: TerminalPanelProps) {
  const termRef = useRef<HTMLDivElement>(null);
  const [tabs, setTabs] = useState<ShellTab[]>([
    { id: 'default', label: 'Shell', term: null, fitAddon: null, ws: null, connected: false },
  ]);
  const [activeTabId, setActiveTabId] = useState('default');
  const tabsRef = useRef(tabs);
  tabsRef.current = tabs;

  // Connect a tab to its WebSocket and xterm instance
  const connectTab = useCallback((tabId: string, container: HTMLDivElement) => {
    if (!sessionId) return;

    const { term, fitAddon } = createTerminal();
    term.open(container);
    fitAddon.fit();

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/sessions/${sessionId}/terminal/${tabId}`;
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      setTabs((prev) => prev.map((t) => t.id === tabId ? { ...t, connected: true } : t));
      term.writeln('\x1b[2m--- Terminal connected ---\x1b[0m');
    };

    ws.onmessage = (event) => {
      term.write(event.data as string);
    };

    ws.onclose = () => {
      setTabs((prev) => prev.map((t) => t.id === tabId ? { ...t, connected: false } : t));
      term.writeln('\x1b[2m--- Terminal disconnected ---\x1b[0m');
    };

    term.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'terminal_input', data: { shell_id: tabId, input: data } }));
      }
    });

    const resizeObserver = new ResizeObserver(() => {
      fitAddon.fit();
      const { cols, rows } = term;
      if (ws.readyState === WebSocket.OPEN && cols > 0 && rows > 0) {
        ws.send(JSON.stringify({ type: 'resize', cols, rows }));
      }
    });
    resizeObserver.observe(container);

    setTabs((prev) => prev.map((t) =>
      t.id === tabId ? { ...t, term, fitAddon, ws } : t,
    ));

    return () => {
      resizeObserver.disconnect();
      ws.close();
      term.dispose();
    };
  }, [sessionId]);

  // Initialize the active tab's terminal when it first mounts
  useEffect(() => {
    if (!termRef.current || !sessionId) return;

    const activeTab = tabsRef.current.find((t) => t.id === activeTabId);
    if (!activeTab) return;

    // Clear the container
    termRef.current.innerHTML = '';

    // If the tab already has a terminal, re-attach it
    if (activeTab.term) {
      activeTab.term.open(termRef.current);
      activeTab.fitAddon?.fit();
      return;
    }

    // Otherwise, create a new connection
    const cleanup = connectTab(activeTabId, termRef.current);
    return cleanup;
  }, [sessionId, activeTabId, connectTab]);

  const handleNewTab = useCallback(() => {
    if (tabs.length >= MAX_TABS) return;
    const shellId = `shell-${tabs.length + 1}`;
    const newTab: ShellTab = {
      id: shellId,
      label: shellId,
      term: null,
      fitAddon: null,
      ws: null,
      connected: false,
    };
    setTabs((prev) => [...prev, newTab]);
    setActiveTabId(shellId);
  }, [tabs.length]);

  const handleCloseTab = useCallback((tabId: string) => {
    if (tabId === 'default') return; // Can't close the default tab
    const tab = tabsRef.current.find((t) => t.id === tabId);
    if (tab) {
      tab.ws?.close();
      tab.term?.dispose();
    }
    setTabs((prev) => prev.filter((t) => t.id !== tabId));
    if (activeTabId === tabId) {
      setActiveTabId('default');
    }
  }, [activeTabId]);

  if (!sessionId) {
    return (
      <div className="flex h-full flex-col items-center justify-center bg-zinc-950 text-zinc-600">
        <Terminal className="mb-2 h-8 w-8" />
        <span className="text-sm">No session active</span>
      </div>
    );
  }

  const activeTab = tabs.find((t) => t.id === activeTabId);

  return (
    <div className="flex h-full flex-col bg-[#09090b]">
      {/* Tab bar */}
      <div className="flex items-center border-b border-zinc-800 bg-zinc-900/50 px-2">
        {tabs.map((tab) => (
          <div
            key={tab.id}
            className={`group flex items-center gap-1 border-r border-zinc-800 px-3 py-1.5 text-xs cursor-pointer ${
              tab.id === activeTabId
                ? 'bg-zinc-800/50 text-zinc-200'
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
            onClick={() => setActiveTabId(tab.id)}
          >
            <Terminal className="h-3 w-3" />
            <span>{tab.label}</span>
            <span
              className={`ml-1 h-1.5 w-1.5 rounded-full ${
                tab.connected ? 'bg-green-400' : 'bg-zinc-600'
              }`}
            />
            {tab.id !== 'default' && (
              <button
                onClick={(e) => { e.stopPropagation(); handleCloseTab(tab.id); }}
                className="ml-1 hidden rounded p-0.5 text-zinc-600 hover:bg-zinc-700 hover:text-zinc-300 group-hover:block"
              >
                <X className="h-2.5 w-2.5" />
              </button>
            )}
          </div>
        ))}
        <button
          onClick={handleNewTab}
          disabled={tabs.length >= MAX_TABS}
          className="ml-auto flex items-center gap-1 rounded px-2 py-1 text-xs text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300 disabled:opacity-30 disabled:cursor-not-allowed"
          title={tabs.length >= MAX_TABS ? `Max ${MAX_TABS} tabs` : 'New shell tab'}
        >
          <Plus className="h-3 w-3" />
        </button>
      </div>

      {/* Terminal */}
      <div ref={termRef} className="flex-1 p-1" />
    </div>
  );
}
