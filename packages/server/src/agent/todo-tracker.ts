/**
 * TodoTracker — manages a structured task list for the agent.
 *
 * Only one item can be `in_progress` at a time.
 * Todo state is emitted as events and injected into LLM context.
 */

export type TodoStatus = 'pending' | 'in_progress' | 'completed';

export interface TodoItem {
  id: number;
  content: string;
  status: TodoStatus;
}

export class TodoTracker {
  private items: TodoItem[] = [];
  private nextId = 1;

  /**
   * Add a new todo item. Returns the new item's ID.
   */
  add(content: string, status: TodoStatus = 'pending'): number {
    if (status === 'in_progress') {
      this.enforceOneInProgress();
    }

    const id = this.nextId++;
    this.items.push({ id, content, status });
    return id;
  }

  /**
   * Update a todo item's status and/or content.
   * Enforces the "only one in_progress" rule.
   */
  update(id: number, changes: { status?: TodoStatus; content?: string }): boolean {
    const item = this.items.find((t) => t.id === id);
    if (!item) return false;

    if (changes.status === 'in_progress') {
      this.enforceOneInProgress(id);
    }

    if (changes.status !== undefined) item.status = changes.status;
    if (changes.content !== undefined) item.content = changes.content;
    return true;
  }

  /**
   * Remove a todo item.
   */
  remove(id: number): boolean {
    const idx = this.items.findIndex((t) => t.id === id);
    if (idx === -1) return false;
    this.items.splice(idx, 1);
    return true;
  }

  /**
   * List all todo items.
   */
  list(): TodoItem[] {
    return [...this.items];
  }

  /**
   * Get the count of items by status.
   */
  counts(): { pending: number; in_progress: number; completed: number; total: number } {
    let pending = 0;
    let in_progress = 0;
    let completed = 0;
    for (const item of this.items) {
      if (item.status === 'pending') pending++;
      else if (item.status === 'in_progress') in_progress++;
      else if (item.status === 'completed') completed++;
    }
    return { pending, in_progress, completed, total: this.items.length };
  }

  /**
   * Build a text representation for injection into the LLM context.
   * Returns null if there are no todos.
   */
  toContext(): string | null {
    if (this.items.length === 0) return null;

    const lines = ['## Current Task List'];
    for (const item of this.items) {
      const marker =
        item.status === 'completed' ? '[x]' :
        item.status === 'in_progress' ? '[~]' :
        '[ ]';
      lines.push(`${marker} ${item.content}`);
    }
    const { pending, in_progress, completed, total } = this.counts();
    lines.push(`\n(${completed}/${total} done, ${in_progress} in progress, ${pending} pending)`);
    return lines.join('\n');
  }

  /**
   * Snapshot the todo list for event emission.
   */
  toEventPayload(): Array<{ content: string; status: string }> {
    return this.items.map((item) => ({
      content: item.content,
      status: item.status,
    }));
  }

  /**
   * Bulk-replace all todos (used when restoring from persistence or LLM output).
   */
  replaceAll(items: Array<{ content: string; status: TodoStatus }>): void {
    this.items = items.map((item, i) => ({
      id: i + 1,
      content: item.content,
      status: item.status,
    }));
    this.nextId = this.items.length + 1;
  }

  /**
   * Clear all todos.
   */
  clear(): void {
    this.items = [];
    this.nextId = 1;
  }

  /**
   * Ensure at most one item is in_progress.
   * If another item is in_progress, set it back to pending.
   */
  private enforceOneInProgress(excludeId?: number): void {
    for (const item of this.items) {
      if (item.status === 'in_progress' && item.id !== excludeId) {
        item.status = 'pending';
      }
    }
  }
}
