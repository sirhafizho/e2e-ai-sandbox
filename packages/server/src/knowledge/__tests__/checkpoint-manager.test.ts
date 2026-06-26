import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from '../../db/database.js';
import { CheckpointStore } from '../../db/checkpoint-store.js';
import { CheckpointManager } from '../checkpoint-manager.js';
import { ConversationHistory } from '../../agent/conversation-history.js';
import { TodoTracker } from '../../agent/todo-tracker.js';
import type Database from 'better-sqlite3';

describe('CheckpointManager', () => {
  let db: Database.Database;
  let checkpointStore: CheckpointStore;
  let manager: CheckpointManager;

  beforeEach(() => {
    db = openDatabase(':memory:');
    checkpointStore = new CheckpointStore(db);
    manager = new CheckpointManager(checkpointStore);
  });

  describe('createCheckpoint', () => {
    it('should create a checkpoint from agent state', () => {
      const history = new ConversationHistory();
      history.addUserMessage('Build the auth module');
      history.addResponseMessages([{ role: 'assistant', content: 'I will start building the auth module.' }]);

      const todoTracker = new TodoTracker();
      const id1 = todoTracker.add('Create auth handler');
      todoTracker.add('Write tests');
      todoTracker.update(id1, { status: 'in_progress' });

      const cp = manager.createCheckpoint('ses_abc', history, todoTracker, 'Build the auth module');

      assert.ok(cp.checkpoint_id.startsWith('cp_'));
      assert.equal(cp.session_id, 'ses_abc');
      assert.equal(cp.task.original_prompt, 'Build the auth module');
      assert.equal(cp.task.current_subtask, 'Create auth handler');
      assert.equal(cp.todo_list.length, 2);
      assert.ok(cp.summary.includes('auth module'));
    });

    it('should persist checkpoint to store', () => {
      const history = new ConversationHistory();
      history.addUserMessage('Fix bug');

      const todoTracker = new TodoTracker();

      const cp = manager.createCheckpoint('ses_abc', history, todoTracker, 'Fix bug');

      const loaded = checkpointStore.get(cp.checkpoint_id);
      assert.ok(loaded);
      assert.equal(loaded.session_id, 'ses_abc');
    });
  });

  describe('loadCheckpoint', () => {
    it('should load the latest checkpoint for a session', () => {
      const history = new ConversationHistory();
      history.addUserMessage('test');
      const todoTracker = new TodoTracker();

      manager.createCheckpoint('ses_abc', history, todoTracker, 'task 1');
      manager.createCheckpoint('ses_abc', history, todoTracker, 'task 2');

      const loaded = manager.loadCheckpoint('ses_abc');
      assert.ok(loaded);
      assert.equal(loaded.session_id, 'ses_abc');
    });

    it('should return null when no checkpoint exists', () => {
      const loaded = manager.loadCheckpoint('ses_nonexistent');
      assert.equal(loaded, null);
    });
  });

  describe('formatForResume', () => {
    it('should format checkpoint for prompt injection', () => {
      const checkpoint = {
        checkpoint_id: 'cp_test',
        session_id: 'ses_abc',
        timestamp: new Date().toISOString(),
        task: {
          original_prompt: 'Build the auth module',
          current_subtask: 'Writing tests',
        },
        todo_list: [
          { content: 'Create auth handler', status: 'completed' },
          { content: 'Write tests', status: 'in_progress' },
          { content: 'Documentation', status: 'pending' },
        ],
        key_discoveries: ['Auth uses JWT RS256'],
        files_modified: ['src/auth/index.ts'],
        files_read: [],
        errors_encountered: ['TypeError in auth flow'],
        decisions_made: [],
        summary: 'Halfway through auth implementation',
      };

      const formatted = manager.formatForResume(checkpoint);

      assert.ok(formatted.includes('Resuming from Checkpoint'));
      assert.ok(formatted.includes('Build the auth module'));
      assert.ok(formatted.includes('Writing tests'));
      assert.ok(formatted.includes('[x] Create auth handler'));
      assert.ok(formatted.includes('[~] Write tests'));
      assert.ok(formatted.includes('[ ] Documentation'));
      assert.ok(formatted.includes('JWT RS256'));
      assert.ok(formatted.includes('src/auth/index.ts'));
      assert.ok(formatted.includes('TypeError'));
      assert.ok(formatted.includes('Continue from where you left off'));
    });

    it('should handle empty checkpoint gracefully', () => {
      const checkpoint = {
        checkpoint_id: 'cp_empty',
        session_id: 'ses_abc',
        timestamp: new Date().toISOString(),
        task: { original_prompt: 'Simple task', current_subtask: 'No specific subtask tracked' },
        todo_list: [],
        key_discoveries: [],
        files_modified: [],
        files_read: [],
        errors_encountered: [],
        decisions_made: [],
        summary: '',
      };

      const formatted = manager.formatForResume(checkpoint);
      assert.ok(formatted.includes('Resuming from Checkpoint'));
      assert.ok(formatted.includes('Simple task'));
      // Should not include "Current Subtask" when it's the default
      assert.ok(!formatted.includes('No specific subtask tracked'));
    });
  });
});
