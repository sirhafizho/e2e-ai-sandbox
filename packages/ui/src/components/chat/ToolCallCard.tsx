import { useState } from 'react';
import { ChevronDown, ChevronRight, Terminal, Check, X, Loader2 } from 'lucide-react';
import type { ToolCall } from '../../lib/store.js';

interface ToolCallCardProps {
  call: ToolCall;
}

export function ToolCallCard({ call }: ToolCallCardProps) {
  const [expanded, setExpanded] = useState(false);

  const statusIcon = {
    running: <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-400" />,
    complete: <Check className="h-3.5 w-3.5 text-green-400" />,
    error: <X className="h-3.5 w-3.5 text-red-400" />,
  }[call.status];

  const statusColor = {
    running: 'border-blue-800/50 bg-blue-950/20',
    complete: 'border-zinc-800 bg-zinc-900/30',
    error: 'border-red-800/50 bg-red-950/20',
  }[call.status];

  const inputSummary = summarizeInput(call.input);

  return (
    <div className={`rounded-lg border ${statusColor}`}>
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm"
      >
        {expanded ? (
          <ChevronDown className="h-3.5 w-3.5 text-zinc-500" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 text-zinc-500" />
        )}
        {statusIcon}
        <Terminal className="h-3.5 w-3.5 text-zinc-500" />
        <span className="font-mono text-xs font-medium text-zinc-300">{call.toolName}</span>
        <span className="flex-1 truncate text-xs text-zinc-500">{inputSummary}</span>
        {call.durationMs != null && (
          <span className="text-xs text-zinc-600">{formatDuration(call.durationMs)}</span>
        )}
      </button>

      {/* Body */}
      {expanded && (
        <div className="border-t border-zinc-800/50 px-3 py-2">
          {/* Input */}
          <div className="mb-2">
            <div className="mb-1 text-xs font-medium text-zinc-500">Input</div>
            <pre className="overflow-x-auto rounded bg-zinc-900 p-2 text-xs text-zinc-400">
              {JSON.stringify(call.input, null, 2)}
            </pre>
          </div>

          {/* Output */}
          {call.output != null && (
            <div>
              <div className="mb-1 text-xs font-medium text-zinc-500">Output</div>
              <pre
                className={`max-h-60 overflow-auto rounded p-2 text-xs ${
                  call.isError
                    ? 'bg-red-950/30 text-red-400'
                    : 'bg-zinc-900 text-zinc-400'
                }`}
              >
                {typeof call.output === 'string'
                  ? call.output
                  : JSON.stringify(call.output, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function summarizeInput(input: Record<string, unknown>): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(input)) {
    if (typeof value === 'string') {
      const truncated = value.length > 50 ? value.slice(0, 47) + '...' : value;
      parts.push(`${key}: ${truncated}`);
    }
  }
  return parts.join(', ') || '...';
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}
