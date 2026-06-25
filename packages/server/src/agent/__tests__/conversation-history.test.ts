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

  it('should handle response messages with tool calls', () => {
    const history = new ConversationHistory();
    history.addUserMessage('list files');

    // AI SDK returns assistant message with tool call + tool result message
    history.addResponseMessages([
      {
        role: 'assistant',
        content: [
          {
            type: 'tool-call',
            toolCallId: 'call_1',
            toolName: 'shell_exec',
            args: { command: 'ls' },
          },
        ],
      },
      {
        role: 'tool',
        content: [
          {
            type: 'tool-result',
            toolCallId: 'call_1',
            toolName: 'shell_exec',
            result: 'file1.txt\nfile2.txt',
          },
        ],
      },
    ]);

    assert.equal(history.length, 3);
    const messages = history.getMessages();
    assert.equal(messages[0]?.role, 'user');
    assert.equal(messages[1]?.role, 'assistant');
    assert.equal(messages[2]?.role, 'tool');
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
});
