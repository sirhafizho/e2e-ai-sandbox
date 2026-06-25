import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  estimateStringTokens,
  estimateMessageTokens,
  estimateMessagesTokens,
  estimateSystemTokens,
} from '../token-estimator.js';
import type { ModelMessage } from 'ai';

describe('estimateStringTokens', () => {
  it('should estimate ~4 chars per token', () => {
    assert.equal(estimateStringTokens(''), 0);
    assert.equal(estimateStringTokens('abcd'), 1);
    assert.equal(estimateStringTokens('abcdefgh'), 2);
  });

  it('should round up partial tokens', () => {
    assert.equal(estimateStringTokens('ab'), 1); // 2/4 = 0.5 → ceil = 1
    assert.equal(estimateStringTokens('abcde'), 2); // 5/4 = 1.25 → ceil = 2
  });

  it('should handle long strings', () => {
    const text = 'a'.repeat(1000);
    assert.equal(estimateStringTokens(text), 250);
  });
});

describe('estimateMessageTokens', () => {
  it('should estimate tokens for a simple string message', () => {
    const msg: ModelMessage = { role: 'user', content: 'Hello world' };
    const tokens = estimateMessageTokens(msg);
    // 11 chars / 4 = 3 + 4 overhead = 7
    assert.equal(tokens, 7);
  });

  it('should estimate tokens for array content with text part', () => {
    const msg: ModelMessage = {
      role: 'assistant',
      content: [{ type: 'text', text: 'Hello!' }],
    };
    const tokens = estimateMessageTokens(msg);
    // 6 chars / 4 = 2 + 4 overhead = 6
    assert.equal(tokens, 6);
  });

  it('should include overhead per message', () => {
    const msg: ModelMessage = { role: 'user', content: '' };
    const tokens = estimateMessageTokens(msg);
    assert.equal(tokens, 4); // Just overhead
  });
});

describe('estimateMessagesTokens', () => {
  it('should sum tokens across messages', () => {
    const messages: ModelMessage[] = [
      { role: 'user', content: 'abcd' }, // 1 + 4 = 5
      { role: 'assistant', content: 'abcdefgh' }, // 2 + 4 = 6
    ];
    assert.equal(estimateMessagesTokens(messages), 11);
  });

  it('should return 0 for empty array', () => {
    assert.equal(estimateMessagesTokens([]), 0);
  });
});

describe('estimateSystemTokens', () => {
  it('should estimate system prompt + tool overhead', () => {
    const prompt = 'a'.repeat(400); // 100 tokens
    const tokens = estimateSystemTokens(prompt, 3);
    // 100 (prompt) + 3 * 150 (tools) = 550
    assert.equal(tokens, 550);
  });

  it('should handle zero tools', () => {
    const prompt = 'a'.repeat(400);
    const tokens = estimateSystemTokens(prompt, 0);
    assert.equal(tokens, 100);
  });
});
