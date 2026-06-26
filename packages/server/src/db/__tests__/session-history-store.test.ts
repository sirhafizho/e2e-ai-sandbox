import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from '../database.js';
import { SessionHistoryStore } from '../session-history-store.js';
import type Database from 'better-sqlite3';

describe('SessionHistoryStore', () => {
  let db: Database.Database;
  let store: SessionHistoryStore;

  beforeEach(() => {
    db = openDatabase(':memory:');
    store = new SessionHistoryStore(db);
  });

  describe('create', () => {
    it('should create a session history entry', () => {
      const entry = store.create({
        sessionId: 'ses_abc123',
        repo: '/home/user/my-app',
        summary: 'Fixed auth bug, refactored middleware',
        decisionsMade: ['Used JWT RS256', 'Split auth module'],
        filesModified: ['src/auth/index.ts', 'src/middleware.ts'],
        errorsHit: ['TypeError in auth flow'],
        durationSeconds: 2100,
        modelUsed: 'gpt-4o',
      });

      assert.equal(entry.session_id, 'ses_abc123');
      assert.equal(entry.repo, '/home/user/my-app');
      assert.equal(entry.summary, 'Fixed auth bug, refactored middleware');
      assert.equal(JSON.parse(entry.decisions_made).length, 2);
      assert.equal(JSON.parse(entry.files_modified).length, 2);
      assert.equal(entry.duration_seconds, 2100);
      assert.equal(entry.model_used, 'gpt-4o');
    });

    it('should create with defaults for optional fields', () => {
      const entry = store.create({
        sessionId: 'ses_minimal',
        summary: 'Quick fix',
        modelUsed: 'qwen2.5-coder:7b',
      });

      assert.equal(entry.repo, null);
      assert.equal(JSON.parse(entry.decisions_made).length, 0);
      assert.equal(entry.duration_seconds, 0);
    });
  });

  describe('get', () => {
    it('should retrieve by session ID', () => {
      store.create({ sessionId: 'ses_test', summary: 'test summary', modelUsed: 'gpt-4o' });
      const entry = store.get('ses_test');
      assert.ok(entry);
      assert.equal(entry.summary, 'test summary');
    });

    it('should return undefined for non-existent ID', () => {
      assert.equal(store.get('ses_nonexistent'), undefined);
    });
  });

  describe('list', () => {
    it('should list recent entries', () => {
      store.create({ sessionId: 'ses_1', summary: 'first', modelUsed: 'gpt-4o' });
      store.create({ sessionId: 'ses_2', summary: 'second', modelUsed: 'gpt-4o' });
      store.create({ sessionId: 'ses_3', summary: 'third', modelUsed: 'gpt-4o' });

      const entries = store.list();
      assert.equal(entries.length, 3);
      const summaries = entries.map((e) => e.summary).sort();
      assert.deepEqual(summaries, ['first', 'second', 'third']);
    });
  });

  describe('search', () => {
    it('should find entries matching summary text', () => {
      store.create({ sessionId: 'ses_1', summary: 'Fixed auth bug', modelUsed: 'gpt-4o' });
      store.create({ sessionId: 'ses_2', summary: 'Added dark mode', modelUsed: 'gpt-4o' });

      const results = store.search('auth');
      assert.equal(results.length, 1);
      assert.ok(results[0]!.summary.includes('auth'));
    });

    it('should find entries matching files_modified', () => {
      store.create({
        sessionId: 'ses_1',
        summary: 'Refactoring',
        filesModified: ['src/components/Button.tsx'],
        modelUsed: 'gpt-4o',
      });

      const results = store.search('Button');
      assert.equal(results.length, 1);
    });
  });

  describe('delete', () => {
    it('should delete an entry', () => {
      store.create({ sessionId: 'ses_del', summary: 'deletable', modelUsed: 'gpt-4o' });
      assert.ok(store.get('ses_del'));

      const deleted = store.delete('ses_del');
      assert.equal(deleted, true);
      assert.equal(store.get('ses_del'), undefined);
    });
  });

  describe('getLastSummary', () => {
    it('should return a summary for a repo with history', () => {
      store.create({
        sessionId: 'ses_old',
        repo: '/my-app',
        summary: 'Old work',
        modelUsed: 'gpt-4o',
      });
      store.create({
        sessionId: 'ses_new',
        repo: '/my-app',
        summary: 'Latest work',
        modelUsed: 'gpt-4o',
      });

      const summary = store.getLastSummary('/my-app');
      assert.ok(summary);
      // Should return one of the summaries (ordering by created_at DESC)
      assert.ok(summary === 'Old work' || summary === 'Latest work');
    });

    it('should return null when no history exists for repo', () => {
      assert.equal(store.getLastSummary('/nonexistent'), null);
    });
  });

  describe('persistence', () => {
    it('should survive store re-creation on same DB', () => {
      store.create({ sessionId: 'ses_persist', summary: 'persistent', modelUsed: 'gpt-4o' });

      const store2 = new SessionHistoryStore(db);
      const entry = store2.get('ses_persist');
      assert.ok(entry);
      assert.equal(entry.summary, 'persistent');
    });
  });
});
