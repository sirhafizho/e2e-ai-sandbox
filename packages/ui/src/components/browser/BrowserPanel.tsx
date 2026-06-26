import { useState } from 'react';
import { Globe, RefreshCw, ArrowLeft, ArrowRight } from 'lucide-react';
import { useSessionStore } from '../../lib/store.js';

interface BrowserPanelProps {
  sessionId: string | null;
}

export function BrowserPanel({ sessionId }: BrowserPanelProps) {
  const screenshot = useSessionStore((s) => s.browserScreenshot);
  const currentUrl = useSessionStore((s) => s.browserUrl);
  const [loading] = useState(false);

  if (!sessionId) {
    return (
      <div className="flex h-full flex-col items-center justify-center bg-zinc-950 text-zinc-600">
        <Globe className="mb-2 h-8 w-8" />
        <span className="text-sm">No session active</span>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-zinc-950">
      {/* URL bar */}
      <div className="flex items-center gap-1 border-b border-zinc-800 bg-zinc-900/50 px-2 py-1">
        <button className="rounded p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300" title="Back">
          <ArrowLeft className="h-3 w-3" />
        </button>
        <button className="rounded p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300" title="Forward">
          <ArrowRight className="h-3 w-3" />
        </button>
        <button className="rounded p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300" title="Refresh">
          <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
        </button>
        <div className="flex flex-1 items-center gap-1.5 rounded bg-zinc-800 px-2 py-1">
          <Globe className="h-3 w-3 text-zinc-500" />
          <span className="flex-1 truncate text-xs text-zinc-400">
            {currentUrl || 'No page loaded'}
          </span>
        </div>
      </div>

      {/* Screenshot area */}
      <div className="flex flex-1 items-center justify-center overflow-hidden p-2">
        {screenshot ? (
          <img
            src={`data:image/png;base64,${screenshot}`}
            alt="Browser screenshot"
            className="max-h-full max-w-full object-contain rounded border border-zinc-800"
          />
        ) : (
          <div className="flex flex-col items-center text-zinc-600">
            <Globe className="mb-2 h-10 w-10 text-zinc-700" />
            <span className="text-xs">Browser view</span>
            <span className="mt-1 text-xs text-zinc-700">
              Screenshots appear when the agent uses browser tools
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
