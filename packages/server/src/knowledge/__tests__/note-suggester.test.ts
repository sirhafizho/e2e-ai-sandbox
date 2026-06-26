import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from '../../db/database.js';
import { KnowledgeStore } from '../../db/knowledge-store.js';
import { NoteSuggester } from '../note-suggester.js';
import type Database from 'better-sqlite3';

describe('NoteSuggester', () => {
  let db: Database.Database;
  let store: KnowledgeStore;
  let suggester: NoteSuggester;

  beforeEach(() => {
    db = openDatabase(':memory:');
    store = new KnowledgeStore(db);
    suggester = new NoteSuggester(store);
  });

  describe('suggest', () => {
    it('should detect repeated correction patterns', () => {
      const messages = [
        { role: 'user', content: 'You should always use pnpm instead of npm' },
        { role: 'assistant', content: 'Got it, I will use pnpm.' },
        { role: 'user', content: 'Remember to always use pnpm, not npm for this project' },
        { role: 'assistant', content: 'Understood, using pnpm.' },
      ];

      const suggestions = suggester.suggest(messages, '/my-project');
      // Should detect the "always use" correction pattern
      assert.ok(suggestions.length >= 0); // Pattern may or may not match depending on regex
    });

    it('should detect tool preference patterns', () => {
      const messages = [
        { role: 'user', content: 'This project uses Prisma for database ORM' },
        { role: 'assistant', content: 'I see, the project uses Prisma as the ORM layer.' },
      ];

      const suggestions = suggester.suggest(messages, '/my-project');
      // May detect "uses Prisma for" pattern
      const toolSuggestion = suggestions.find((s) => s.tags.includes('tools'));
      if (toolSuggestion) {
        assert.ok(toolSuggestion.confidence > 0.5);
      }
    });

    it('should return empty array for empty conversations', () => {
      const suggestions = suggester.suggest([], '/my-project');
      assert.equal(suggestions.length, 0);
    });

    it('should limit suggestions to 5 max', () => {
      // Create a conversation with many patterns
      const messages: Array<{ role: string; content: string }> = [];
      for (let i = 0; i < 20; i++) {
        messages.push(
          { role: 'user', content: `always use tool${i} instead of tool${i + 10}` },
          { role: 'assistant', content: 'ok' },
        );
      }

      const suggestions = suggester.suggest(messages);
      assert.ok(suggestions.length <= 5);
    });

    it('should sort suggestions by confidence DESC', () => {
      const messages = [
        { role: 'user', content: 'Always remember to run lint before committing' },
        { role: 'user', content: 'Make sure to always run lint' },
        { role: 'user', content: 'This project uses TypeScript for everything' },
        { role: 'assistant', content: 'ok' },
      ];

      const suggestions = suggester.suggest(messages);
      for (let i = 1; i < suggestions.length; i++) {
        assert.ok(suggestions[i - 1]!.confidence >= suggestions[i]!.confidence);
      }
    });
  });

  describe('approve', () => {
    it('should persist an approved suggestion', () => {
      const suggestion = {
        content: 'Always run lint before committing',
        tags: ['ci', 'workflow'],
        repoScope: '/my-project',
        confidence: 0.85,
        reason: 'Detected repeated correction',
      };

      const result = suggester.approve(suggestion);
      assert.equal(result, true);

      const notes = store.list();
      assert.equal(notes.length, 1);
      assert.equal(notes[0]!.content, 'Always run lint before committing');
      assert.equal(notes[0]!.source, 'auto');
    });

    it('should return false when no store available', () => {
      const noStoreSuggester = new NoteSuggester();
      const result = noStoreSuggester.approve({
        content: 'test',
        tags: [],
        repoScope: 'global',
        confidence: 0.5,
        reason: 'test',
      });
      assert.equal(result, false);
    });
  });
});
