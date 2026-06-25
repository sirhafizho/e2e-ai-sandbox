import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { TodoTracker } from '../todo-tracker.js';

describe('TodoTracker', () => {
  describe('add', () => {
    it('should add a todo item with default pending status', () => {
      const tracker = new TodoTracker();
      const id = tracker.add('Write tests');
      assert.equal(id, 1);

      const items = tracker.list();
      assert.equal(items.length, 1);
      assert.equal(items[0]!.content, 'Write tests');
      assert.equal(items[0]!.status, 'pending');
    });

    it('should assign incrementing IDs', () => {
      const tracker = new TodoTracker();
      const id1 = tracker.add('First');
      const id2 = tracker.add('Second');
      const id3 = tracker.add('Third');

      assert.equal(id1, 1);
      assert.equal(id2, 2);
      assert.equal(id3, 3);
    });

    it('should add with specified status', () => {
      const tracker = new TodoTracker();
      tracker.add('Task 1', 'in_progress');
      assert.equal(tracker.list()[0]!.status, 'in_progress');
    });
  });

  describe('update', () => {
    it('should update status', () => {
      const tracker = new TodoTracker();
      tracker.add('Task');
      tracker.update(1, { status: 'in_progress' });

      assert.equal(tracker.list()[0]!.status, 'in_progress');
    });

    it('should update content', () => {
      const tracker = new TodoTracker();
      tracker.add('Old content');
      tracker.update(1, { content: 'New content' });

      assert.equal(tracker.list()[0]!.content, 'New content');
    });

    it('should return false for non-existent ID', () => {
      const tracker = new TodoTracker();
      assert.equal(tracker.update(999, { status: 'completed' }), false);
    });

    it('should return true on success', () => {
      const tracker = new TodoTracker();
      tracker.add('Task');
      assert.equal(tracker.update(1, { status: 'completed' }), true);
    });
  });

  describe('only one in_progress', () => {
    it('should reset previous in_progress when setting a new one', () => {
      const tracker = new TodoTracker();
      tracker.add('Task 1', 'in_progress');
      tracker.add('Task 2');
      tracker.update(2, { status: 'in_progress' });

      const items = tracker.list();
      assert.equal(items[0]!.status, 'pending');
      assert.equal(items[1]!.status, 'in_progress');
    });

    it('should enforce on add with in_progress status', () => {
      const tracker = new TodoTracker();
      tracker.add('Task 1', 'in_progress');
      tracker.add('Task 2', 'in_progress');

      const items = tracker.list();
      assert.equal(items[0]!.status, 'pending');
      assert.equal(items[1]!.status, 'in_progress');
    });

    it('should allow multiple pending and completed', () => {
      const tracker = new TodoTracker();
      tracker.add('Done 1', 'completed');
      tracker.add('Done 2', 'completed');
      tracker.add('Todo 1');
      tracker.add('Todo 2');

      const counts = tracker.counts();
      assert.equal(counts.completed, 2);
      assert.equal(counts.pending, 2);
      assert.equal(counts.in_progress, 0);
    });
  });

  describe('remove', () => {
    it('should remove a todo', () => {
      const tracker = new TodoTracker();
      tracker.add('Task 1');
      tracker.add('Task 2');
      const removed = tracker.remove(1);

      assert.equal(removed, true);
      assert.equal(tracker.list().length, 1);
      assert.equal(tracker.list()[0]!.content, 'Task 2');
    });

    it('should return false for non-existent ID', () => {
      const tracker = new TodoTracker();
      assert.equal(tracker.remove(999), false);
    });
  });

  describe('counts', () => {
    it('should count items by status', () => {
      const tracker = new TodoTracker();
      tracker.add('Pending 1');
      tracker.add('Pending 2');
      tracker.add('In progress', 'in_progress');
      tracker.add('Done', 'completed');

      const counts = tracker.counts();
      assert.equal(counts.pending, 2);
      assert.equal(counts.in_progress, 1);
      assert.equal(counts.completed, 1);
      assert.equal(counts.total, 4);
    });
  });

  describe('toContext', () => {
    it('should return null when empty', () => {
      const tracker = new TodoTracker();
      assert.equal(tracker.toContext(), null);
    });

    it('should include all items with status markers', () => {
      const tracker = new TodoTracker();
      tracker.add('Pending task');
      tracker.add('Active task', 'in_progress');
      tracker.add('Done task', 'completed');

      const context = tracker.toContext()!;
      assert.ok(context.includes('## Current Task List'));
      assert.ok(context.includes('[ ] Pending task'));
      assert.ok(context.includes('[~] Active task'));
      assert.ok(context.includes('[x] Done task'));
      assert.ok(context.includes('1/3 done'));
    });
  });

  describe('toEventPayload', () => {
    it('should return serializable payload', () => {
      const tracker = new TodoTracker();
      tracker.add('Task 1');
      tracker.add('Task 2', 'in_progress');

      const payload = tracker.toEventPayload();
      assert.deepEqual(payload, [
        { content: 'Task 1', status: 'pending' },
        { content: 'Task 2', status: 'in_progress' },
      ]);
    });
  });

  describe('replaceAll', () => {
    it('should replace all items', () => {
      const tracker = new TodoTracker();
      tracker.add('Old 1');
      tracker.add('Old 2');

      tracker.replaceAll([
        { content: 'New 1', status: 'pending' },
        { content: 'New 2', status: 'completed' },
        { content: 'New 3', status: 'in_progress' },
      ]);

      assert.equal(tracker.list().length, 3);
      assert.equal(tracker.list()[0]!.content, 'New 1');
      assert.equal(tracker.list()[2]!.status, 'in_progress');
    });

    it('should reset IDs', () => {
      const tracker = new TodoTracker();
      tracker.add('Old');
      tracker.replaceAll([{ content: 'New', status: 'pending' }]);

      // Next add should continue from after the replaced items
      const id = tracker.add('Another');
      assert.equal(id, 2);
    });
  });

  describe('clear', () => {
    it('should remove all items', () => {
      const tracker = new TodoTracker();
      tracker.add('Task 1');
      tracker.add('Task 2');
      tracker.clear();

      assert.equal(tracker.list().length, 0);
      assert.equal(tracker.toContext(), null);
    });

    it('should reset IDs', () => {
      const tracker = new TodoTracker();
      tracker.add('Task');
      tracker.clear();
      const id = tracker.add('New task');
      assert.equal(id, 1);
    });
  });
});
