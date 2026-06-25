import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ConversationHistory } from '../conversation-history.js';

describe('ConversationHistory', () => {
  it('should start empty', () => {
    const history = new ConversationHistory();
    assert.equal(history.length, 0);
    assert.deepEqual(history.getMessages(), []);
  });

  it('should add user messages', () => {
    const history = new ConversationHistory();
    history.addUserMessage('hello');
    history.addUserMessage('world');

    assert.equal(history.length, 2);
    const messages = history.getMessages();
    assert.equal(messages[0]?.role, 'user');
    assert.equal(messages[0]?.content, 'hello');
    assert.equal(messages[1]?.role, 'user');
    assert.equal(messages[1]?.content, 'world');
  });

  it('should add response messages', () => {
    const history = new ConversationHistory();
    history.addUserMessage('hi');
    history.addResponseMessages([
      { role: 'assistant', content: [{ type: 'text', text: 'Hello!' }] },
    ]);

    assert.equal(history.length, 2);
    const messages = history.getMessages();
    assert.equal(messages[1]?.role, 'assistant');
  });

  it('should return a copy from getMessages', () => {
    const history = new ConversationHistory();
    history.addUserMessage('test');

    const messages1 = history.getMessages();
    const messages2 = history.getMessages();

    assert.notEqual(messages1, messages2);
    assert.deepEqual(messages1, messages2);
  });

  it('should clear history', () => {
    const history = new ConversationHistory();
    history.addUserMessage('one');
    history.addUserMessage('two');
    assert.equal(history.length, 2);

    history.clear();
    assert.equal(history.length, 0);
    assert.deepEqual(history.getMessages(), []);
  });

  it('should build multi-turn conversation correctly', () => {
    const history = new ConversationHistory();

    // Turn 1
    history.addUserMessage('What is 2+2?');
    history.addResponseMessages([
      { role: 'assistant', content: [{ type: 'text', text: '4' }] },
    ]);

    // Turn 2
    history.addUserMessage('And 3+3?');
    history.addResponseMessages([
      { role: 'assistant', content: [{ type: 'text', text: '6' }] },
    ]);

    assert.equal(history.length, 4);
    const messages = history.getMessages();
    assert.equal(messages[0]?.role, 'user');
    assert.equal(messages[1]?.role, 'assistant');
    assert.equal(messages[2]?.role, 'user');
    assert.equal(messages[3]?.role, 'assistant');
  });

  it('should handle multiple response messages per turn', () => {
    const history = new ConversationHistory();
    history.addUserMessage('list files');

    // AI SDK may return multiple messages per turn (assistant + tool results)
    history.addResponseMessages([
      { role: 'assistant', content: 'Let me check the files.' },
      { role: 'assistant', content: 'Here are the files.' },
    ]);

    assert.equal(history.length, 3);
    const messages = history.getMessages();
    assert.equal(messages[0]?.role, 'user');
    assert.equal(messages[1]?.role, 'assistant');
    assert.equal(messages[2]?.role, 'assistant');
  });

  describe('getSummary', () => {
    it('should summarize string content messages', () => {
      const history = new ConversationHistory();
      history.addUserMessage('hello world');

      const summary = history.getSummary();
      assert.equal(summary.length, 1);
      assert.equal(summary[0]?.role, 'user');
      assert.equal(summary[0]?.preview, 'hello world');
    });

    it('should summarize array content messages', () => {
      const history = new ConversationHistory();
      history.addResponseMessages([
        { role: 'assistant', content: [{ type: 'text', text: 'Hi there!' }] },
      ]);

      const summary = history.getSummary();
      assert.equal(summary.length, 1);
      assert.equal(summary[0]?.role, 'assistant');
      assert.equal(summary[0]?.preview, 'Hi there!');
    });

    it('should truncate long previews to 100 chars', () => {
      const history = new ConversationHistory();
      const longMessage = 'a'.repeat(200);
      history.addUserMessage(longMessage);

      const summary = history.getSummary();
      assert.equal(summary[0]?.preview.length, 100);
    });
  });

  describe('context windowing', () => {
    /** Build a history with N complete turns (user + assistant). */
    function buildTurns(history: ConversationHistory, count: number): void {
      for (let i = 1; i <= count; i++) {
        history.addUserMessage(`User message ${i}`);
        history.addResponseMessages([
          { role: 'assistant', content: `Assistant response ${i}` },
        ]);
      }
    }

    it('should start without a context summary', () => {
      const history = new ConversationHistory();
      assert.equal(history.hasSummary, false);
      assert.equal(history.getContextSummary(), null);
    });

    it('should clear context summary on clear()', () => {
      const history = new ConversationHistory();
      buildTurns(history, 5);
      history.applyWindowing('summary');
      assert.equal(history.hasSummary, true);
      history.clear();
      assert.equal(history.hasSummary, false);
    });

    it('should find turn boundary keeping last 3 turns', () => {
      const history = new ConversationHistory();
      buildTurns(history, 5);

      // 5 turns = 10 messages. Keep last 3 turns.
      // Turns 3, 4, 5 should be kept. Turn 3 starts at user message index 4.
      const boundary = history.findTurnBoundary();
      assert.ok(boundary > 0, 'Should find a boundary');

      // Messages at the boundary should be a user message
      const messages = history.getMessages();
      assert.equal(messages[boundary]?.role, 'user');
    });

    it('should return 0 boundary when not enough turns', () => {
      const history = new ConversationHistory();
      buildTurns(history, 2);
      assert.equal(history.findTurnBoundary(), 0);
    });

    it('should apply windowing and evict old messages', () => {
      const history = new ConversationHistory();
      buildTurns(history, 5);
      assert.equal(history.length, 10);

      const tokensFreed = history.applyWindowing('Context from earlier turns');
      assert.ok(tokensFreed > 0, 'Should free some tokens');
      assert.ok(history.length < 10, 'Should have fewer messages');
      assert.equal(history.hasSummary, true);
      assert.equal(history.getContextSummary(), 'Context from earlier turns');
    });

    it('should return 0 tokens freed when nothing to evict', () => {
      const history = new ConversationHistory();
      buildTurns(history, 2);
      const tokensFreed = history.applyWindowing('summary');
      assert.equal(tokensFreed, 0);
      assert.equal(history.hasSummary, false); // No summary added
    });

    it('should merge summaries on repeated windowing', () => {
      const history = new ConversationHistory();
      buildTurns(history, 6);
      history.applyWindowing('Summary 1');

      // Add more turns and window again
      buildTurns(history, 4);
      history.applyWindowing('Summary 2');

      const summary = history.getContextSummary();
      assert.ok(summary !== null);
      assert.ok(summary.includes('Summary 1'));
      assert.ok(summary.includes('Summary 2'));
    });

    it('should preserve retained turns after windowing', () => {
      const history = new ConversationHistory({ retainedTurns: 2 });
      buildTurns(history, 5);

      history.applyWindowing('summary');

      // Should have last 2 turns retained (4 messages)
      const messages = history.getMessages();
      // First retained message should be a user message
      assert.equal(messages[0]?.role, 'user');
      // Content should be from the later turns
      assert.ok(
        (messages[0]?.content as string).includes('4') || (messages[0]?.content as string).includes('5'),
        'Retained messages should be from recent turns',
      );
    });

    it('should estimate tokens for messages', () => {
      const history = new ConversationHistory();
      history.addUserMessage('Hello world');
      const tokens = history.estimateTokens();
      assert.ok(tokens > 0, 'Should estimate some tokens');
    });

    it('should get evictable content as text', () => {
      const history = new ConversationHistory();
      buildTurns(history, 5);

      const content = history.getEvictableContent();
      assert.ok(content.length > 0);
      assert.ok(content.includes('[USER]'));
      assert.ok(content.includes('[ASSISTANT]'));
    });

    it('should return empty evictable content when not enough turns', () => {
      const history = new ConversationHistory();
      buildTurns(history, 2);
      assert.equal(history.getEvictableContent(), '');
    });

    it('should estimate evictable tokens', () => {
      const history = new ConversationHistory();
      buildTurns(history, 5);

      const evictableTokens = history.estimateEvictableTokens();
      const totalTokens = history.estimateTokens();
      assert.ok(evictableTokens > 0);
      assert.ok(evictableTokens < totalTokens, 'Evictable should be less than total');
    });

    it('should support custom retained turns count', () => {
      const history = new ConversationHistory({ retainedTurns: 1 });
      buildTurns(history, 3);

      const boundary = history.findTurnBoundary();
      assert.ok(boundary > 0);

      history.applyWindowing('summary');
      // With retainedTurns=1, only the last turn's user message onward should remain
      const messages = history.getMessages();
      const userMessages = messages.filter(m => m.role === 'user');
      assert.equal(userMessages.length, 1);
    });
  });
});
