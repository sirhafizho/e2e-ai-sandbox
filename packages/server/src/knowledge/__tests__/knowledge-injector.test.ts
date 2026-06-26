import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from '../../db/database.js';
import { KnowledgeStore } from '../../db/knowledge-store.js';
import { SessionHistoryStore } from '../../db/session-history-store.js';
import { RepoMapStore } from '../../db/repo-map-store.js';
import { KnowledgeInjector } from '../knowledge-injector.js';
import type Database from 'better-sqlite3';

describe('KnowledgeInjector', () => {
  let db: Database.Database;
  let knowledgeStore: KnowledgeStore;
  let sessionHistoryStore: SessionHistoryStore;
  let repoMapStore: RepoMapStore;

  beforeEach(() => {
    db = openDatabase(':memory:');
    knowledgeStore = new KnowledgeStore(db);
    sessionHistoryStore = new SessionHistoryStore(db);
    repoMapStore = new RepoMapStore(db);
  });

  describe('gather', () => {
    it('should gather knowledge notes for a repo', async () => {
      knowledgeStore.create({ content: 'Always run lint', repoScope: '/my-app', tags: ['ci'] });
      knowledgeStore.create({ content: 'Global rule', repoScope: 'global' });

      const injector = new KnowledgeInjector({ knowledgeStore });
      const context = await injector.gather(null, '/my-app', ['lint']);

      assert.ok(context.notes.length >= 1);
      assert.ok(context.notes.some((n) => n.content.includes('lint')));
    });

    it('should gather session history', async () => {
      sessionHistoryStore.create({
        sessionId: 'ses_old',
        repo: '/my-app',
        summary: 'Refactored auth module',
        modelUsed: 'gpt-4o',
      });

      const injector = new KnowledgeInjector({ sessionHistoryStore });
      const context = await injector.gather(null, '/my-app');

      assert.equal(context.lastSessionSummary, 'Refactored auth module');
    });

    it('should gather repo map', async () => {
      repoMapStore.save(
        '/my-app',
        JSON.stringify({ files_count: 42, tree: 'src/\n  index.ts', key_exports: ['createApp'] }),
        '{}',
      );

      const injector = new KnowledgeInjector({ repoMapStore });
      const context = await injector.gather(null, '/my-app');

      assert.ok(context.repoMap);
      assert.ok(context.repoMap.includes('42 files'));
      assert.ok(context.repoMap.includes('createApp'));
    });

    it('should return empty context when no stores available', async () => {
      const injector = new KnowledgeInjector({});
      const context = await injector.gather(null, null);

      assert.equal(context.notes.length, 0);
      assert.equal(context.rules.length, 0);
      assert.equal(context.lastSessionSummary, null);
      assert.equal(context.repoMap, null);
    });
  });

  describe('format', () => {
    it('should format notes as markdown list', () => {
      const injector = new KnowledgeInjector({});
      const formatted = injector.format({
        notes: [
          {
            id: 'note_1',
            content: 'Use TypeScript strict mode',
            tags: '["typescript"]',
            repo_scope: 'global',
            source: 'user' as const,
            created_at: new Date().toISOString(),
            last_used_at: null,
          },
        ],
        rules: [],
        lastSessionSummary: null,
        repoMap: null,
      });

      assert.ok(formatted.includes('## Knowledge Notes'));
      assert.ok(formatted.includes('Use TypeScript strict mode'));
      assert.ok(formatted.includes('[typescript]'));
    });

    it('should format session summary', () => {
      const injector = new KnowledgeInjector({});
      const formatted = injector.format({
        notes: [],
        rules: [],
        lastSessionSummary: 'Fixed the auth bug in middleware',
        repoMap: null,
      });

      assert.ok(formatted.includes('## Previous Session'));
      assert.ok(formatted.includes('Fixed the auth bug'));
    });

    it('should return empty string when no context', () => {
      const injector = new KnowledgeInjector({});
      const formatted = injector.format({
        notes: [],
        rules: [],
        lastSessionSummary: null,
        repoMap: null,
      });

      assert.equal(formatted, '');
    });
  });

  describe('inject', () => {
    it('should gather and format in one call', async () => {
      knowledgeStore.create({ content: 'Test everything', tags: ['testing'] });

      const injector = new KnowledgeInjector({ knowledgeStore });
      const result = await injector.inject(null, 'global', ['testing']);

      assert.ok(result.includes('Test everything'));
    });
  });
});
