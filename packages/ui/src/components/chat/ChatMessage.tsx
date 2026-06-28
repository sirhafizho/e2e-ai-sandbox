import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import { User, Bot, Copy, Check, Info } from 'lucide-react';
import { useState, useCallback, useRef, useEffect } from 'react';
import type { ChatMessage as ChatMessageType } from '../../lib/store.js';

interface ChatMessageProps {
  message: ChatMessageType;
}

export function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === 'user';
  const isSystem = message.role === 'system';

  // System messages render as compact info banners
  if (isSystem) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-zinc-800 bg-zinc-900/50 px-3 py-2 text-xs text-zinc-400">
        <Info className="h-3.5 w-3.5 flex-shrink-0 text-zinc-500" />
        <span>{message.content}</span>
      </div>
    );
  }

  return (
    <div className={`flex gap-3 ${isUser ? '' : ''}`}>
      {/* Avatar */}
      <div
        className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full ${
          isUser ? 'bg-zinc-700' : 'bg-blue-600'
        }`}
      >
        {isUser ? (
          <User className="h-3.5 w-3.5 text-zinc-300" />
        ) : (
          <Bot className="h-3.5 w-3.5 text-white" />
        )}
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1">
        <div className="mb-1 text-xs font-medium text-zinc-500">
          {isUser ? 'You' : 'Forge'}
        </div>
        <div
          className={`prose prose-invert prose-sm max-w-none ${
            isUser
              ? 'rounded-lg bg-zinc-800 px-4 py-2.5 text-zinc-200'
              : 'text-zinc-300'
          }`}
        >
          {isUser ? (
            <p className="m-0 whitespace-pre-wrap">{message.content}</p>
          ) : (
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              rehypePlugins={[rehypeHighlight]}
              components={{
                pre: ({ children }) => (
                  <CodeBlock>{children}</CodeBlock>
                ),
                code: ({ className, children, ...props }) => {
                  const isInline = !className;
                  if (isInline) {
                    return (
                      <code className="rounded bg-zinc-800 px-1.5 py-0.5 text-sm text-blue-300" {...props}>
                        {children}
                      </code>
                    );
                  }
                  return <code className={className} {...props}>{children}</code>;
                },
              }}
            >
              {message.content}
            </ReactMarkdown>
          )}
        </div>
      </div>
    </div>
  );
}

function CodeBlock({ children }: { children: React.ReactNode }) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, []);

  const handleCopy = useCallback(() => {
    const text = extractText(children);
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setCopied(false), 2000);
    });
  }, [children]);

  return (
    <div className="group relative my-3 rounded-lg border border-zinc-800 bg-zinc-900">
      <button
        onClick={handleCopy}
        className="absolute right-2 top-2 flex items-center gap-1 rounded-md bg-zinc-800 px-2 py-1 text-xs text-zinc-400 opacity-0 transition-opacity group-hover:opacity-100 hover:text-zinc-200"
      >
        {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
        {copied ? 'Copied' : 'Copy'}
      </button>
      <pre className="m-0 overflow-x-auto p-4 text-sm">{children}</pre>
    </div>
  );
}

function extractText(node: React.ReactNode): string {
  if (typeof node === 'string') return node;
  if (typeof node === 'number') return String(node);
  if (!node) return '';
  if (Array.isArray(node)) return node.map(extractText).join('');
  if (typeof node === 'object' && node !== null && 'props' in (node as unknown as Record<string, unknown>)) {
    const el = node as unknown as { props: { children?: React.ReactNode } };
    return extractText(el.props.children);
  }
  return '';
}
