import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyError,
  getRetryPolicy,
  getEscalationLevel,
  calculateRetryDelay,
  withRetry,
  buildErrorReport,
  type ErrorRecoveryEvent,
} from '../error-recovery.js';

describe('classifyError', () => {
  it('should classify rate limit errors', () => {
    assert.equal(classifyError(new Error('Rate limit exceeded')), 'llm_rate_limit');
    assert.equal(classifyError(new Error('HTTP 429 Too Many Requests')), 'llm_rate_limit');
    assert.equal(classifyError(new Error('too many requests')), 'llm_rate_limit');
  });

  it('should classify server errors', () => {
    assert.equal(classifyError(new Error('HTTP 500 Internal Server Error')), 'llm_server_error');
    assert.equal(classifyError(new Error('502 Bad Gateway')), 'llm_server_error');
    assert.equal(classifyError(new Error('503 Service Unavailable')), 'llm_server_error');
  });

  it('should classify network errors', () => {
    assert.equal(classifyError(new Error('ECONNREFUSED')), 'network_error');
    assert.equal(classifyError(new Error('ENOTFOUND')), 'network_error');
    assert.equal(classifyError(new Error('fetch failed')), 'network_error');
  });

  it('should classify permission errors', () => {
    assert.equal(classifyError(new Error('Permission denied')), 'permission_denied');
    assert.equal(classifyError(new Error('EACCES')), 'permission_denied');
    assert.equal(classifyError(new Error('403 Forbidden')), 'permission_denied');
  });

  it('should classify file not found errors', () => {
    assert.equal(classifyError(new Error('ENOENT: no such file')), 'file_not_found');
    assert.equal(classifyError(new Error('File not found: /foo/bar')), 'file_not_found');
  });

  it('should classify timeout errors', () => {
    assert.equal(classifyError(new Error('Operation timed out')), 'tool_timeout');
    assert.equal(classifyError(new Error('Timeout exceeded')), 'tool_timeout');
  });

  it('should classify command failures', () => {
    assert.equal(classifyError(new Error('exit code 1')), 'command_failed');
    assert.equal(classifyError(new Error('Command failed')), 'command_failed');
  });

  it('should return unknown for unrecognized errors', () => {
    assert.equal(classifyError(new Error('Something went wrong')), 'unknown');
    assert.equal(classifyError('string error'), 'unknown');
  });

  it('should handle non-Error values', () => {
    assert.equal(classifyError('rate limit'), 'llm_rate_limit');
    assert.equal(classifyError(42), 'unknown');
  });
});

describe('getRetryPolicy', () => {
  it('should return correct policy for each category', () => {
    const rateLimitPolicy = getRetryPolicy('llm_rate_limit');
    assert.equal(rateLimitPolicy.maxRetries, 5);
    assert.equal(rateLimitPolicy.baseDelayMs, 2000);
    assert.equal(rateLimitPolicy.jitter, true);

    const permissionPolicy = getRetryPolicy('permission_denied');
    assert.equal(permissionPolicy.maxRetries, 0);

    const timeoutPolicy = getRetryPolicy('tool_timeout');
    assert.equal(timeoutPolicy.maxRetries, 3);
    assert.equal(timeoutPolicy.baseDelayMs, 1000);
  });
});

describe('getEscalationLevel', () => {
  it('should return retry when within budget', () => {
    assert.equal(getEscalationLevel('tool_timeout', 0), 'retry');
    assert.equal(getEscalationLevel('tool_timeout', 1), 'retry');
    assert.equal(getEscalationLevel('tool_timeout', 2), 'retry');
  });

  it('should return alternative when retries exhausted', () => {
    assert.equal(getEscalationLevel('tool_timeout', 3), 'alternative');
  });

  it('should return escalate beyond alternative', () => {
    assert.equal(getEscalationLevel('tool_timeout', 4), 'escalate');
  });

  it('should immediately ask_user for permission_denied', () => {
    assert.equal(getEscalationLevel('permission_denied', 0), 'ask_user');
  });
});

describe('calculateRetryDelay', () => {
  it('should return 0 for zero base delay', () => {
    const policy = getRetryPolicy('command_failed');
    assert.equal(calculateRetryDelay(policy, 0), 0);
  });

  it('should apply exponential backoff', () => {
    const policy = getRetryPolicy('tool_timeout');
    assert.equal(calculateRetryDelay(policy, 0), 1000); // 1000 * 2^0
    assert.equal(calculateRetryDelay(policy, 1), 2000); // 1000 * 2^1
    assert.equal(calculateRetryDelay(policy, 2), 4000); // 1000 * 2^2
  });

  it('should add jitter when enabled', () => {
    const policy = getRetryPolicy('llm_rate_limit');
    assert.equal(policy.jitter, true);

    // Run multiple times to verify jitter adds variation
    const delays = new Set<number>();
    for (let i = 0; i < 10; i++) {
      delays.add(calculateRetryDelay(policy, 0));
    }
    // With jitter, we should get different values (very unlikely to be all same)
    assert.ok(delays.size > 1, 'Jitter should produce varying delays');
  });
});

describe('withRetry', () => {
  it('should return result on first success', async () => {
    const result = await withRetry(async () => 42);
    assert.equal(result, 42);
  });

  it('should retry on failure and succeed', async () => {
    let attempts = 0;
    const result = await withRetry(
      async () => {
        attempts++;
        if (attempts < 3) throw new Error('timeout');
        return 'success';
      },
      { category: 'tool_timeout' },
    );

    assert.equal(result, 'success');
    assert.equal(attempts, 3);
  });

  it('should throw after exhausting retries', async () => {
    await assert.rejects(
      () =>
        withRetry(
          async () => {
            throw new Error('always fails with timeout');
          },
          { category: 'tool_timeout', policy: { baseDelayMs: 0 } },
        ),
      { message: 'always fails with timeout' },
    );
  });

  it('should call onRetry callback for each retry', async () => {
    const events: ErrorRecoveryEvent[] = [];
    let attempts = 0;

    await withRetry(
      async () => {
        attempts++;
        if (attempts < 3) throw new Error('timeout');
        return 'ok';
      },
      {
        category: 'tool_timeout',
        policy: { baseDelayMs: 0 },
        onRetry: (event) => events.push(event),
      },
    );

    assert.equal(events.length, 2); // 2 retries before success
    assert.equal(events[0]?.level, 'retry');
    assert.equal(events[0]?.attempt, 0);
    assert.equal(events[1]?.level, 'retry');
    assert.equal(events[1]?.attempt, 1);
  });

  it('should respect abort signal', async () => {
    const controller = new AbortController();
    controller.abort();

    await assert.rejects(
      () =>
        withRetry(
          async () => {
            throw new Error('fail');
          },
          {
            category: 'tool_timeout',
            abortSignal: controller.signal,
          },
        ),
    );
  });

  it('should auto-classify error category when not provided', async () => {
    const events: ErrorRecoveryEvent[] = [];

    await assert.rejects(
      () =>
        withRetry(
          async () => {
            throw new Error('Permission denied');
          },
          {
            policy: { baseDelayMs: 0 },
            onRetry: (event) => events.push(event),
          },
        ),
    );

    // permission_denied has 0 retries → immediately escalates
    assert.equal(events.length, 1);
    assert.equal(events[0]?.category, 'permission_denied');
    assert.equal(events[0]?.level, 'ask_user');
  });

  it('should not retry for permission_denied', async () => {
    let attempts = 0;

    await assert.rejects(
      () =>
        withRetry(async () => {
          attempts++;
          throw new Error('EACCES permission denied');
        }),
    );

    assert.equal(attempts, 1); // No retries
  });
});

describe('buildErrorReport', () => {
  it('should build a report with error details', () => {
    const report = buildErrorReport('llm_rate_limit', new Error('429 Too Many Requests'), 3);
    assert.ok(report.includes('429 Too Many Requests'));
    assert.ok(report.includes('llm_rate_limit'));
    assert.ok(report.includes('4/6')); // attempt 3 of maxRetries 5
    assert.ok(report.includes('Recommendation'));
  });

  it('should include category-specific recommendations', () => {
    assert.ok(buildErrorReport('network_error', 'fail', 0).includes('network connection'));
    assert.ok(buildErrorReport('permission_denied', 'fail', 0).includes('permissions'));
    assert.ok(buildErrorReport('file_not_found', 'fail', 0).includes('file path'));
  });

  it('should handle non-Error values', () => {
    const report = buildErrorReport('unknown', 'string error', 0);
    assert.ok(report.includes('string error'));
  });
});
