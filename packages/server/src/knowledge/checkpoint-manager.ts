import type { CheckpointStore } from '../db/checkpoint-store.js';
import type { ConversationHistory } from '../agent/conversation-history.js';
import type { TodoTracker } from '../agent/todo-tracker.js';

/**
 * Checkpoint data structure.
 */
export interface CheckpointData {
  checkpoint_id: string;
  session_id: string;
  timestamp: string;
  task: {
    original_prompt: string;
    current_subtask: string;
  };
  todo_list: Array<{ content: string; status: string }>;
  key_discoveries: string[];
  files_modified: string[];
  files_read: string[];
  errors_encountered: string[];
  decisions_made: string[];
  summary: string;
}

/**
 * CheckpointManager — saves and restores agent state at token budget emergency.
 *
 * When the agent loop hits 95%+ token usage, a checkpoint is created
 * capturing the current task state, todo list, and a summary of progress.
 * On resume, the checkpoint is loaded to restore context.
 */
export class CheckpointManager {
  private checkpointStore: CheckpointStore;

  constructor(checkpointStore: CheckpointStore) {
    this.checkpointStore = checkpointStore;
  }

  /**
   * Create a checkpoint from the current agent state.
   */
  createCheckpoint(
    sessionId: string,
    history: ConversationHistory,
    todoTracker: TodoTracker,
    originalPrompt: string,
  ): CheckpointData {
    // Extract key information from conversation history
    const messages = history.getMessages();
    const { discoveries, files, errors, decisions } = this.extractFromHistory(messages);

    // Build summary from context summary + recent messages
    const contextSummary = history.getContextSummary();
    const recentMessages = messages.slice(-6); // Last 3 turns
    const recentText = recentMessages
      .filter((m) => typeof m.content === 'string')
      .map((m) => `[${m.role}]: ${(m.content as string).slice(0, 200)}`)
      .join('\n');

    const summary = contextSummary
      ? `${contextSummary}\n\nRecent:\n${recentText}`
      : recentText;

    // Determine current subtask from todo list
    const todos = todoTracker.list();
    const inProgress = todos.find((t) => t.status === 'in_progress');
    const currentSubtask = inProgress?.content ?? 'No specific subtask tracked';

    const data: CheckpointData = {
      checkpoint_id: '', // Will be set by store
      session_id: sessionId,
      timestamp: new Date().toISOString(),
      task: {
        original_prompt: originalPrompt,
        current_subtask: currentSubtask,
      },
      todo_list: todos.map((t) => ({ content: t.content, status: t.status })),
      key_discoveries: discoveries,
      files_modified: files.modified,
      files_read: files.read,
      errors_encountered: errors,
      decisions_made: decisions,
      summary,
    };

    // Persist to store (best-effort — don't crash agent on store failure)
    try {
      const row = this.checkpointStore.save(sessionId, JSON.stringify(data));
      data.checkpoint_id = row.checkpoint_id;
    } catch (err) {
      console.error('Failed to save checkpoint:', err);
      data.checkpoint_id = `cp_unsaved_${Date.now()}`;
    }

    return data;
  }

  /**
   * Load the latest checkpoint for a session.
   */
  loadCheckpoint(sessionId: string): CheckpointData | null {
    const row = this.checkpointStore.getLatest(sessionId);
    if (!row) return null;

    try {
      return JSON.parse(row.data) as CheckpointData;
    } catch {
      return null;
    }
  }

  /**
   * Format a checkpoint for injection into the agent's context.
   */
  formatForResume(checkpoint: CheckpointData): string {
    const parts: string[] = [];

    parts.push(`## Resuming from Checkpoint`);
    parts.push(`\nYou are resuming a previous session. Here's what you were working on:`);

    parts.push(`\n### Original Task\n${checkpoint.task.original_prompt}`);

    if (checkpoint.task.current_subtask !== 'No specific subtask tracked') {
      parts.push(`\n### Current Subtask\n${checkpoint.task.current_subtask}`);
    }

    if (checkpoint.summary) {
      parts.push(`\n### Progress Summary\n${checkpoint.summary}`);
    }

    if (checkpoint.todo_list.length > 0) {
      const todoLines = checkpoint.todo_list.map((t) => {
        const marker = t.status === 'completed' ? 'x' : t.status === 'in_progress' ? '~' : ' ';
        return `- [${marker}] ${t.content}`;
      });
      parts.push(`\n### Todo List\n${todoLines.join('\n')}`);
    }

    if (checkpoint.key_discoveries.length > 0) {
      parts.push(`\n### Key Discoveries\n${checkpoint.key_discoveries.map((d) => `- ${d}`).join('\n')}`);
    }

    if (checkpoint.files_modified.length > 0) {
      parts.push(`\n### Files Modified\n${checkpoint.files_modified.map((f) => `- ${f}`).join('\n')}`);
    }

    if (checkpoint.errors_encountered.length > 0) {
      parts.push(`\n### Errors Encountered\n${checkpoint.errors_encountered.map((e) => `- ${e}`).join('\n')}`);
    }

    parts.push(`\nContinue from where you left off.`);

    return parts.join('\n');
  }

  /**
   * Extract structured information from conversation messages.
   */
  private extractFromHistory(messages: Array<{ role: string; content: unknown }>): {
    discoveries: string[];
    files: { modified: string[]; read: string[] };
    errors: string[];
    decisions: string[];
  } {
    const discoveries: string[] = [];
    const filesModified: Set<string> = new Set();
    const filesRead: Set<string> = new Set();
    const errors: string[] = [];
    const decisions: string[] = [];

    for (const msg of messages) {
      if (typeof msg.content !== 'string') continue;
      const content = msg.content;

      // Extract file paths from tool calls
      const fileWriteMatch = content.match(/file_write.*?["']([/\w.-]+)["']/g);
      if (fileWriteMatch) {
        for (const match of fileWriteMatch) {
          const path = match.match(/["']([/\w.-]+)["']/)?.[1];
          if (path) filesModified.add(path);
        }
      }

      const fileReadMatch = content.match(/file_read.*?["']([/\w.-]+)["']/g);
      if (fileReadMatch) {
        for (const match of fileReadMatch) {
          const path = match.match(/["']([/\w.-]+)["']/)?.[1];
          if (path) filesRead.add(path);
        }
      }

      // Extract errors
      if (content.toLowerCase().includes('error') || content.toLowerCase().includes('failed')) {
        const errorLine = content.split('\n').find((l) =>
          /error|failed|exception/i.test(l),
        );
        if (errorLine && errorLine.length < 200) {
          errors.push(errorLine.trim());
        }
      }
    }

    return {
      discoveries,
      files: {
        modified: [...filesModified].slice(0, 20),
        read: [...filesRead].slice(0, 20),
      },
      errors: errors.slice(0, 10),
      decisions,
    };
  }
}
