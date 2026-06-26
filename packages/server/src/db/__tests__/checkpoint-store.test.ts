import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from '../database.js';
import { CheckpointStore } from '../checkpoint-store.js';
import type Database from 'better-sqlite3';

describe('CheckpointStore', () => {
  let db: Database.Database;
  let store: CheckpointStore;

  beforeEach(() => {
    db = openDatabase(':memory:');
    store = new CheckpointStore(db);
  });

  const sampleData = JSON.stringify({
    task: { original_prompt: 'Build auth module', current_subtask: 'Writing tests' },
    todo_list: [
      { content: 'Create auth handler', status: 'completed' },
      { content: 'Write tests', status: 'in_progress' },
    ],
    key_discoveries: ['Auth uses JWT RS256'],
    summary: 'Halfway through auth implementation',
  });

  describe('save', () => {
    it('should save a checkpoint', () => {
      const cp = store.save('ses_abc', sampleData);
      assert.ok(cp.checkpoint_id.startsWith('cp_'));
      assert.equal(cp.session_id, 'ses_abc');
      assert.equal(cp.data, sampleData);
      assert.ok(cp.created_at);
    });
  });

  describe('get', () => {
    it('should retrieve by checkpoint ID', () => {
      const cp = store.save('ses_abc', sampleData);
      const retrieved = store.get(cp.checkpoint_id);
      assert.ok(retrieved);
      assert.equal(retrieved.checkpoint_id, cp.checkpoint_id);
      assert.equal(retrieved.data, sampleData);
    });

    it('should return undefined for non-existent ID', () => {
      assert.equal(store.get('cp_nonexistent'), undefined);
    });
  });

  describe('getLatest', () => {
    it('should return a checkpoint for a session with multiple', () => {
      store.save('ses_abc', '{"summary": "first"}');
      store.save('ses_abc', '{"summary": "second"}');
      store.save('ses_abc', '{"summary": "third"}');

      const latest = store.getLatest('ses_abc');
      assert.ok(latest);
      assert.equal(latest.session_id, 'ses_abc');
      // Should return one of the checkpoints (latest by created_at DESC)
      assert.ok(latest.data.includes('summary'));
    });

    it('should return undefined when no checkpoints exist', () => {
      assert.equal(store.getLatest('ses_nonexistent'), undefined);
    });
  });

  describe('listBySession', () => {
    it('should list all checkpoints for a session', () => {
      store.save('ses_abc', '{"n":1}');
      store.save('ses_abc', '{"n":2}');
      store.save('ses_other', '{"n":3}');

      const list = store.listBySession('ses_abc');
      assert.equal(list.length, 2);
    });
  });

  describe('delete', () => {
    it('should delete a checkpoint', () => {
      const cp = store.save('ses_abc', sampleData);
      assert.ok(store.get(cp.checkpoint_id));

      const deleted = store.delete(cp.checkpoint_id);
      assert.equal(deleted, true);
      assert.equal(store.get(cp.checkpoint_id), undefined);
    });
  });

  describe('deleteBySession', () => {
    it('should delete all checkpoints for a session', () => {
      store.save('ses_abc', '{"n":1}');
      store.save('ses_abc', '{"n":2}');
      store.save('ses_other', '{"n":3}');

      const count = store.deleteBySession('ses_abc');
      assert.equal(count, 2);
      assert.equal(store.listBySession('ses_abc').length, 0);
      assert.equal(store.listBySession('ses_other').length, 1);
    });
  });
});
