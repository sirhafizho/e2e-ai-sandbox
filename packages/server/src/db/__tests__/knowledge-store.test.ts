import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from '../database.js';
import { KnowledgeStore } from '../knowledge-store.js';
import type Database from 'better-sqlite3';

describe('KnowledgeStore', () => {
  let db: Database.Database;
  let store: KnowledgeStore;

  beforeEach(() => {
    db = openDatabase(':memory:');
    store = new KnowledgeStore(db);
  });

  describe('create', () => {
    it('should create a knowledge note with defaults', () => {
      const note = store.create({ content: 'Always run lint before committing' });
      assert.ok(note.id.startsWith('note_'));
      assert.equal(note.content, 'Always run lint before committing');
      assert.equal(note.tags, '[]');
      assert.equal(note.repo_scope, 'global');
      assert.equal(note.source, 'user');
      assert.ok(note.created_at);
      assert.equal(note.last_used_at, null);
    });

    it('should create a note with tags and repo scope', () => {
      const note = store.create({
        content: 'This project uses Prisma for ORM',
        tags: ['architecture', 'database'],
        repoScope: '/home/user/my-app',
        source: 'auto',
      });
      assert.equal(note.repo_scope, '/home/user/my-app');
      assert.equal(note.source, 'auto');
      assert.equal(JSON.parse(note.tags).length, 2);
      assert.ok(JSON.parse(note.tags).includes('architecture'));
    });
  });

  describe('get', () => {
    it('should retrieve a note by ID', () => {
      const created = store.create({ content: 'test note' });
      const retrieved = store.get(created.id);
      assert.ok(retrieved);
      assert.equal(retrieved.id, created.id);
      assert.equal(retrieved.content, 'test note');
    });

    it('should return undefined for non-existent ID', () => {
      const result = store.get('note_nonexistent');
      assert.equal(result, undefined);
    });
  });

  describe('list', () => {
    it('should list all notes', () => {
      store.create({ content: 'first note' });
      store.create({ content: 'second note' });
      store.create({ content: 'third note' });

      const notes = store.list();
      assert.equal(notes.length, 3);
      const contents = notes.map((n) => n.content).sort();
      assert.deepEqual(contents, ['first note', 'second note', 'third note']);
    });

    it('should return empty array when no notes exist', () => {
      const notes = store.list();
      assert.equal(notes.length, 0);
    });
  });

  describe('listByRepo', () => {
    it('should return repo-specific and global notes', () => {
      store.create({ content: 'global note', repoScope: 'global' });
      store.create({ content: 'repo note', repoScope: '/home/user/my-app' });
      store.create({ content: 'other repo', repoScope: '/home/user/other' });

      const notes = store.listByRepo('/home/user/my-app');
      assert.equal(notes.length, 2);
      const contents = notes.map((n) => n.content);
      assert.ok(contents.includes('global note'));
      assert.ok(contents.includes('repo note'));
    });
  });

  describe('search', () => {
    it('should find notes matching a query string', () => {
      store.create({ content: 'Use TypeScript for all new code', tags: ['style'] });
      store.create({ content: 'Python tests should use pytest', tags: ['testing'] });

      const results = store.search('global', 'TypeScript');
      assert.equal(results.length, 1);
      assert.ok(results[0]!.content.includes('TypeScript'));
    });

    it('should search in tags', () => {
      store.create({ content: 'Run lint', tags: ['ci', 'linting'] });
      store.create({ content: 'No console.log', tags: ['style'] });

      const results = store.search('global', 'linting');
      assert.equal(results.length, 1);
    });
  });

  describe('delete', () => {
    it('should delete a note by ID', () => {
      const note = store.create({ content: 'deletable' });
      assert.ok(store.get(note.id));

      const deleted = store.delete(note.id);
      assert.equal(deleted, true);
      assert.equal(store.get(note.id), undefined);
    });

    it('should return false for non-existent ID', () => {
      const deleted = store.delete('note_nonexistent');
      assert.equal(deleted, false);
    });
  });

  describe('touchUsed', () => {
    it('should update last_used_at timestamp', () => {
      const note = store.create({ content: 'test' });
      assert.equal(note.last_used_at, null);

      store.touchUsed(note.id);
      const updated = store.get(note.id);
      assert.ok(updated);
      assert.ok(updated.last_used_at);
    });
  });

  describe('findRelevant', () => {
    it('should score notes by keyword matches', () => {
      store.create({ content: 'Use TypeScript everywhere', tags: ['typescript', 'style'] });
      store.create({ content: 'Always test your code', tags: ['testing'] });
      store.create({ content: 'TypeScript strict mode is required', tags: ['typescript'] });

      const relevant = store.findRelevant('global', ['typescript'], 10);
      assert.ok(relevant.length >= 2);
      // TypeScript notes should be first
      assert.ok(relevant[0]!.content.toLowerCase().includes('typescript'));
    });

    it('should return all notes when no keywords provided', () => {
      store.create({ content: 'note 1' });
      store.create({ content: 'note 2' });

      const relevant = store.findRelevant('global', [], 10);
      assert.equal(relevant.length, 2);
    });

    it('should respect limit parameter', () => {
      for (let i = 0; i < 5; i++) {
        store.create({ content: `TypeScript note ${i}`, tags: ['typescript'] });
      }

      const relevant = store.findRelevant('global', ['typescript'], 3);
      assert.equal(relevant.length, 3);
    });
  });

  describe('persistence', () => {
    it('should survive KnowledgeStore re-creation on same DB', () => {
      store.create({ content: 'persistent note', tags: ['test'] });

      const store2 = new KnowledgeStore(db);
      const notes = store2.list();
      assert.equal(notes.length, 1);
      assert.equal(notes[0]!.content, 'persistent note');
    });
  });
});
