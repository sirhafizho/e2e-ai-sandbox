import { Check, Circle, Loader2 } from 'lucide-react';
import type { TodoItem } from '../../lib/store.js';

interface TodoListProps {
  todos: TodoItem[];
}

export function TodoList({ todos }: TodoListProps) {
  if (todos.length === 0) return null;

  const completed = todos.filter((t) => t.status === 'completed').length;

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-medium text-zinc-400">
          Tasks ({completed}/{todos.length})
        </span>
        {/* Progress bar */}
        <div className="h-1.5 w-24 overflow-hidden rounded-full bg-zinc-800">
          <div
            className="h-full rounded-full bg-blue-500 transition-all"
            style={{ width: `${(completed / todos.length) * 100}%` }}
          />
        </div>
      </div>

      <div className="space-y-1">
        {todos.map((todo, i) => (
          <div key={i} className="flex items-start gap-2 text-xs">
            <span className="mt-0.5 flex-shrink-0">
              {todo.status === 'completed' && <Check className="h-3.5 w-3.5 text-green-400" />}
              {todo.status === 'in_progress' && (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-400" />
              )}
              {todo.status === 'pending' && <Circle className="h-3.5 w-3.5 text-zinc-600" />}
            </span>
            <span
              className={
                todo.status === 'completed'
                  ? 'text-zinc-500 line-through'
                  : todo.status === 'in_progress'
                    ? 'text-zinc-200'
                    : 'text-zinc-400'
              }
            >
              {todo.content}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
