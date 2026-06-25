import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { TokenBudget, getModelContextWindow } from '../token-budget.js';

describe('getModelContextWindow', () => {
  it('should return known context window for exact model match', () => {
    assert.equal(getModelContextWindow('gpt-4o'), 128_000);
    assert.equal(getModelContextWindow('qwen2.5-coder:7b'), 32_768);
    assert.equal(getModelContextWindow('claude-sonnet-4-20250514'), 200_000);
  });

  it('should match by prefix for versioned models', () => {
    assert.equal(getModelContextWindow('gpt-4o-2024-08-06'), 128_000);
  });

  it('should return default for unknown models', () => {
    assert.equal(getModelContextWindow('some-unknown-model'), 32_768);
  });
});

describe('TokenBudget', () => {
  it('should compute usable budget with default 15% response reserve', () => {
    const budget = new TokenBudget({ contextWindow: 100_000 });
    assert.equal(budget.usableBudget, 85_000);
  });

  it('should compute usable budget with custom response reserve', () => {
    const budget = new TokenBudget({ contextWindow: 100_000, responseReserve: 0.20 });
    assert.equal(budget.usableBudget, 80_000);
  });

  it('should start with zero usage', () => {
    const budget = new TokenBudget({ contextWindow: 100_000 });
    assert.equal(budget.tokensUsed, 0);
    assert.equal(budget.tokensRemaining, 85_000);
    assert.equal(budget.usageRatio, 0);
    assert.equal(budget.level, 'normal');
  });

  it('should track usage correctly', () => {
    const budget = new TokenBudget({ contextWindow: 100_000 });
    budget.setUsage(10_000);
    assert.equal(budget.tokensUsed, 10_000);
    assert.equal(budget.tokensRemaining, 75_000);
  });

  it('should add usage incrementally', () => {
    const budget = new TokenBudget({ contextWindow: 100_000 });
    budget.addUsage(5_000);
    budget.addUsage(3_000);
    assert.equal(budget.tokensUsed, 8_000);
  });

  it('should reduce usage (from summarization)', () => {
    const budget = new TokenBudget({ contextWindow: 100_000 });
    budget.setUsage(20_000);
    budget.reduceUsage(5_000);
    assert.equal(budget.tokensUsed, 15_000);
  });

  it('should not go below zero on reduce', () => {
    const budget = new TokenBudget({ contextWindow: 100_000 });
    budget.setUsage(1_000);
    budget.reduceUsage(5_000);
    assert.equal(budget.tokensUsed, 0);
  });

  it('should reset usage', () => {
    const budget = new TokenBudget({ contextWindow: 100_000 });
    budget.setUsage(50_000);
    budget.resetUsage();
    assert.equal(budget.tokensUsed, 0);
  });

  describe('threshold levels', () => {
    it('should be normal below 70%', () => {
      const budget = new TokenBudget({ contextWindow: 100_000 });
      budget.setUsage(59_000); // 59K / 85K = ~69%
      assert.equal(budget.level, 'normal');
      assert.equal(budget.shouldSummarize(), false);
    });

    it('should be warning at 70%', () => {
      const budget = new TokenBudget({ contextWindow: 100_000 });
      budget.setUsage(59_500); // 59.5K / 85K = 70%
      assert.equal(budget.level, 'warning');
      assert.equal(budget.shouldSummarize(), true);
      assert.equal(budget.shouldForceSummarize(), false);
    });

    it('should be critical at 85%', () => {
      const budget = new TokenBudget({ contextWindow: 100_000 });
      budget.setUsage(72_250); // 72.25K / 85K = 85%
      assert.equal(budget.level, 'critical');
      assert.equal(budget.shouldSummarize(), true);
      assert.equal(budget.shouldForceSummarize(), true);
      assert.equal(budget.shouldCheckpoint(), false);
    });

    it('should be emergency at 95%', () => {
      const budget = new TokenBudget({ contextWindow: 100_000 });
      budget.setUsage(80_750); // 80.75K / 85K = 95%
      assert.equal(budget.level, 'emergency');
      assert.equal(budget.shouldCheckpoint(), true);
    });
  });

  describe('custom thresholds', () => {
    it('should use custom warning threshold', () => {
      const budget = new TokenBudget({
        contextWindow: 100_000,
        warningThreshold: 0.50,
      });
      budget.setUsage(42_500); // 42.5K / 85K = 50%
      assert.equal(budget.level, 'warning');
    });
  });

  describe('forModel', () => {
    it('should create budget from model name', () => {
      const budget = TokenBudget.forModel('gpt-4o');
      assert.equal(budget.getStatus().contextWindow, 128_000);
    });

    it('should accept overrides', () => {
      const budget = TokenBudget.forModel('gpt-4o', { warningThreshold: 0.50 });
      budget.setUsage(55_000); // 55K / 108.8K ~= 50%
      assert.equal(budget.shouldSummarize(), true);
    });
  });

  describe('getStatus', () => {
    it('should return full status snapshot', () => {
      const budget = new TokenBudget({ contextWindow: 100_000 });
      budget.setUsage(30_000);

      const status = budget.getStatus();
      assert.equal(status.contextWindow, 100_000);
      assert.equal(status.usableBudget, 85_000);
      assert.equal(status.used, 30_000);
      assert.equal(status.remaining, 55_000);
      assert.ok(Math.abs(status.usageRatio - 30_000 / 85_000) < 0.001);
      assert.equal(status.level, 'normal');
    });
  });
});
