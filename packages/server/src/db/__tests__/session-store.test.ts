import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import type Database from 'better-sqlite3';
import { openDatabase } from '../database.js';
import { SessionStore } from '../session-store.js';

describe('SessionStore', () => {
  let db: Database.Database;
  let store: SessionStore;

  beforeEach(() => {
    db = openDatabase(':memory:');
    store = new SessionStore(db);
  });

  describe('create', () => {
    it('should create a session and return the row', () => {
      const row = store.create({
        id: 'ses_abc123',
        model: 'qwen2.5-coder:7b',
        containerId: 'container_xyz',
      });

      assert.equal(row.id, 'ses_abc123');
      assert.equal(row.status, 'ready');
      assert.equal(row.model, 'qwen2.5-coder:7b');
      assert.equal(row.container_id, 'container_xyz');
      assert.equal(row.volume_name, null);
      assert.equal(row.history_json, '[]');
      assert.equal(row.context_summary, null);
      assert.ok(row.created_at);
      assert.ok(row.updated_at);
      assert.ok(row.last_active_at);
    });

    it('should create a session with volume name', () => {
      const row = store.create({
        id: 'ses_vol123',
        model: 'gpt-4o',
        containerId: 'cnt_1',
        volumeName: 'forge-workspace-vol123',
      });

      assert.equal(row.volume_name, 'forge-workspace-vol123');
    });

    it('should reject duplicate session IDs', () => {
      store.create({ id: 'ses_dup', model: 'test', containerId: 'cnt_1' });
      assert.throws(() => {
        store.create({ id: 'ses_dup', model: 'test', containerId: 'cnt_2' });
      });
    });
  });

  describe('get', () => {
    it('should return a session by ID', () => {
      store.create({ id: 'ses_get1', model: 'test-model', containerId: 'cnt_g1' });
      const row = store.get('ses_get1');
      assert.ok(row);
      assert.equal(row.id, 'ses_get1');
      assert.equal(row.model, 'test-model');
    });

    it('should return undefined for non-existent ID', () => {
      const row = store.get('ses_nonexistent');
      assert.equal(row, undefined);
    });
  });

  describe('list', () => {
    it('should return empty array when no sessions', () => {
      const sessions = store.list();
      assert.deepEqual(sessions, []);
    });

    it('should return all sessions', () => {
      store.create({ id: 'ses_list1', model: 'm1', containerId: 'c1' });
      store.create({ id: 'ses_list2', model: 'm2', containerId: 'c2' });
      store.create({ id: 'ses_list3', model: 'm3', containerId: 'c3' });

      const sessions = store.list();
      assert.equal(sessions.length, 3);
      const ids = sessions.map((s) => s.id).sort();
      assert.deepEqual(ids, ['ses_list1', 'ses_list2', 'ses_list3']);
    });

    it('should order by updated_at DESC when timestamps differ', () => {
      store.create({ id: 'ses_ord1', model: 'm1', containerId: 'c1' });
      store.create({ id: 'ses_ord2', model: 'm2', containerId: 'c2' });
      // Touch ses_ord1 so it has a newer updated_at
      store.touchActivity('ses_ord1');

      const sessions = store.list();
      assert.equal(sessions[0]!.id, 'ses_ord1');
    });
  });

  describe('listActive', () => {
    it('should exclude terminated sessions', () => {
      store.create({ id: 'ses_active1', model: 'm1', containerId: 'c1' });
      store.create({ id: 'ses_active2', model: 'm2', containerId: 'c2' });
      store.terminate('ses_active2');

      const active = store.listActive();
      assert.equal(active.length, 1);
      assert.equal(active[0]!.id, 'ses_active1');
    });
  });

  describe('update', () => {
    it('should update session status', () => {
      store.create({ id: 'ses_upd1', model: 'm1', containerId: 'c1' });
      const result = store.update('ses_upd1', { status: 'running' });
      assert.equal(result, true);

      const row = store.get('ses_upd1');
      assert.equal(row!.status, 'running');
    });

    it('should update container_id', () => {
      store.create({ id: 'ses_upd2', model: 'm1', containerId: 'c1' });
      store.update('ses_upd2', { containerId: 'c2_new' });

      const row = store.get('ses_upd2');
      assert.equal(row!.container_id, 'c2_new');
    });

    it('should set container_id to null', () => {
      store.create({ id: 'ses_upd3', model: 'm1', containerId: 'c1' });
      store.update('ses_upd3', { containerId: null });

      const row = store.get('ses_upd3');
      assert.equal(row!.container_id, null);
    });

    it('should return false for non-existent session', () => {
      const result = store.update('ses_nope', { status: 'running' });
      assert.equal(result, false);
    });

    it('should update updated_at timestamp', () => {
      store.create({ id: 'ses_upd4', model: 'm1', containerId: 'c1' });
      const before = store.get('ses_upd4')!.updated_at;

      // Small delay to ensure different timestamp
      store.update('ses_upd4', { status: 'running' });
      const after = store.get('ses_upd4')!.updated_at;
      assert.ok(after >= before);
    });
  });

  describe('updateHistory', () => {
    it('should update history JSON', () => {
      store.create({ id: 'ses_hist1', model: 'm1', containerId: 'c1' });

      const messages = [
        { role: 'user', content: 'hello' },
        { role: 'assistant', content: 'hi there' },
      ];

      const result = store.updateHistory('ses_hist1', JSON.stringify(messages), null);
      assert.equal(result, true);

      const row = store.get('ses_hist1');
      assert.deepEqual(JSON.parse(row!.history_json), messages);
      assert.equal(row!.context_summary, null);
    });

    it('should update context summary', () => {
      store.create({ id: 'ses_hist2', model: 'm1', containerId: 'c1' });

      store.updateHistory('ses_hist2', '[]', 'User asked about Docker setup');
      const row = store.get('ses_hist2');
      assert.equal(row!.context_summary, 'User asked about Docker setup');
    });

    it('should return false for non-existent session', () => {
      const result = store.updateHistory('ses_nope', '[]', null);
      assert.equal(result, false);
    });
  });

  describe('touchActivity', () => {
    it('should update last_active_at', () => {
      store.create({ id: 'ses_touch1', model: 'm1', containerId: 'c1' });
      const before = store.get('ses_touch1')!.last_active_at;

      const result = store.touchActivity('ses_touch1');
      assert.equal(result, true);

      const after = store.get('ses_touch1')!.last_active_at;
      assert.ok(after >= before);
    });

    it('should return false for non-existent session', () => {
      const result = store.touchActivity('ses_nope');
      assert.equal(result, false);
    });
  });

  describe('delete', () => {
    it('should delete a session', () => {
      store.create({ id: 'ses_del1', model: 'm1', containerId: 'c1' });
      const result = store.delete('ses_del1');
      assert.equal(result, true);
      assert.equal(store.get('ses_del1'), undefined);
    });

    it('should return false for non-existent session', () => {
      const result = store.delete('ses_nope');
      assert.equal(result, false);
    });
  });

  describe('terminate', () => {
    it('should set status to terminated and clear container_id', () => {
      store.create({ id: 'ses_term1', model: 'm1', containerId: 'c1' });
      const result = store.terminate('ses_term1');
      assert.equal(result, true);

      const row = store.get('ses_term1');
      assert.equal(row!.status, 'terminated');
      assert.equal(row!.container_id, null);
    });
  });

  describe('countActive', () => {
    it('should count non-terminated sessions', () => {
      assert.equal(store.countActive(), 0);

      store.create({ id: 'ses_cnt1', model: 'm1', containerId: 'c1' });
      store.create({ id: 'ses_cnt2', model: 'm2', containerId: 'c2' });
      assert.equal(store.countActive(), 2);

      store.terminate('ses_cnt1');
      assert.equal(store.countActive(), 1);
    });
  });

  describe('persistence roundtrip', () => {
    it('should persist and restore conversation history', () => {
      store.create({ id: 'ses_rt1', model: 'gpt-4o', containerId: 'cnt_rt1' });

      const history = [
        { role: 'user', content: 'Set up a Node.js project' },
        { role: 'assistant', content: [{ type: 'text', text: 'I\'ll create a Node.js project for you.' }] },
        { role: 'assistant', content: [{ type: 'tool-call', toolCallId: 'tc1', toolName: 'shell_exec', args: { command: 'npm init -y' } }] },
        { role: 'tool', content: [{ type: 'tool-result', toolCallId: 'tc1', result: { stdout: 'ok', exit_code: 0 } }] },
      ];

      store.updateHistory('ses_rt1', JSON.stringify(history), 'User wants Node.js project setup');

      // Simulate server restart — re-read from DB
      const restored = store.get('ses_rt1');
      assert.ok(restored);
      const restoredHistory = JSON.parse(restored.history_json);
      assert.equal(restoredHistory.length, 4);
      assert.equal(restoredHistory[0].role, 'user');
      assert.equal(restoredHistory[0].content, 'Set up a Node.js project');
      assert.equal(restored.context_summary, 'User wants Node.js project setup');
    });
  });
});
