import { useState, useRef, useEffect } from 'react';
import { Send, Square } from 'lucide-react';
import { useSessionStore } from '../../lib/store.js';
import { ChatMessage } from './ChatMessage.js';
import { TodoList } from './TodoList.js';
import { ToolCallCard } from './ToolCallCard.js';

interface ChatPanelProps {
  onSendMessage: (content: string) => void;
  onCancel: () => void;
}

export function ChatPanel({ onSendMessage, onCancel }: ChatPanelProps) {
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const { messages, toolCalls, todos, isAgentWorking } = useSessionStore();

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, toolCalls]);

  const handleSubmit = () => {
    const trimmed = input.trim();
    if (!trimmed) return;
    onSendMessage(trimmed);
    setInput('');
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  // Build interleaved messages + tool calls
  const toolCallArray = Array.from(toolCalls.values());

  return (
    <div className="flex h-full flex-col bg-zinc-950">
      {/* Todo list (if any) */}
      {todos.length > 0 && (
        <div className="border-b border-zinc-800 px-4 py-3">
          <TodoList todos={todos} />
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {messages.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center text-zinc-600">
            <p className="text-lg font-medium">Start a conversation</p>
            <p className="mt-1 text-sm">Type a message below to begin working with the agent</p>
          </div>
        )}

        <div className="mx-auto max-w-3xl space-y-4">
          {messages.map((msg) => (
            <ChatMessage key={msg.id} message={msg} />
          ))}

          {/* Tool calls */}
          {toolCallArray.length > 0 && (
            <div className="space-y-2">
              {toolCallArray.map((call) => (
                <ToolCallCard key={call.callId} call={call} />
              ))}
            </div>
          )}

          {/* Typing indicator */}
          {isAgentWorking && (
            <div className="flex items-center gap-2 py-2 text-sm text-zinc-500">
              <div className="flex gap-1">
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-blue-400 [animation-delay:0ms]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-blue-400 [animation-delay:150ms]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-blue-400 [animation-delay:300ms]" />
              </div>
              Agent is working...
            </div>
          )}
        </div>
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="border-t border-zinc-800 p-4">
        <div className="mx-auto flex max-w-3xl items-end gap-2">
          <div className="relative flex-1">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Send a message..."
              rows={1}
              className="w-full resize-none rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-3 text-sm text-zinc-100 placeholder-zinc-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500/50"
              style={{ minHeight: '44px', maxHeight: '200px' }}
            />
          </div>

          {isAgentWorking ? (
            <button
              onClick={onCancel}
              className="flex h-11 w-11 items-center justify-center rounded-lg bg-red-600 text-white transition-colors hover:bg-red-500"
              title="Stop agent"
            >
              <Square className="h-4 w-4" />
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={!input.trim()}
              className="flex h-11 w-11 items-center justify-center rounded-lg bg-blue-600 text-white transition-colors hover:bg-blue-500 disabled:opacity-30 disabled:hover:bg-blue-600"
              title="Send message"
            >
              <Send className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
