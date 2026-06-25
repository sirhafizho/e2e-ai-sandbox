import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ParallelDispatch } from '../parallel-dispatch.js';

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('ParallelDispatch', () => {
  it('should execute a single task', async () => {
    const dispatch = new ParallelDispatch(10);
    const result = await dispatch.execute(async () => 42);
    assert.equal(result, 42);
    assert.equal(dispatch.totalDispatched, 1);
    assert.equal(dispatch.peakConcurrency, 1);
  });

  it('should execute tasks in parallel up to limit', async () => {
    const dispatch = new ParallelDispatch(3);
    const order: number[] = [];

    const tasks = Array.from({ length: 5 }, (_, i) =>
      dispatch.execute(async () => {
        order.push(i);
        await delay(50);
        return i;
      }),
    );

    const results = await Promise.all(tasks);
    assert.deepEqual(results, [0, 1, 2, 3, 4]);
    assert.equal(dispatch.totalDispatched, 5);
    assert.ok(dispatch.peakConcurrency <= 3, `Peak should be <= 3, got ${dispatch.peakConcurrency}`);
  });

  it('should respect maxParallel=1 (serial)', async () => {
    const dispatch = new ParallelDispatch(1);
    const events: string[] = [];

    const task = async (name: string) => {
      events.push(`start:${name}`);
      await delay(20);
      events.push(`end:${name}`);
      return name;
    };

    const results = await Promise.all([
      dispatch.execute(() => task('a')),
      dispatch.execute(() => task('b')),
      dispatch.execute(() => task('c')),
    ]);

    assert.deepEqual(results, ['a', 'b', 'c']);
    assert.equal(dispatch.peakConcurrency, 1);

    // Serial: start-a, end-a, start-b, end-b, start-c, end-c
    assert.equal(events[0], 'start:a');
    assert.equal(events[1], 'end:a');
    assert.equal(events[2], 'start:b');
    assert.equal(events[3], 'end:b');
    assert.equal(events[4], 'start:c');
    assert.equal(events[5], 'end:c');
  });

  it('should handle errors without blocking the queue', async () => {
    const dispatch = new ParallelDispatch(2);

    const results = await Promise.allSettled([
      dispatch.execute(async () => 'ok'),
      dispatch.execute(async () => { throw new Error('fail'); }),
      dispatch.execute(async () => 'also ok'),
    ]);

    assert.equal(results[0]!.status, 'fulfilled');
    assert.equal(results[1]!.status, 'rejected');
    assert.equal(results[2]!.status, 'fulfilled');
    assert.equal(dispatch.totalDispatched, 3);
  });

  it('should track current concurrency and queue length', async () => {
    const dispatch = new ParallelDispatch(2);

    assert.equal(dispatch.currentConcurrency, 0);
    assert.equal(dispatch.queueLength, 0);

    let resolveFirst!: () => void;
    let resolveSecond!: () => void;

    const p1 = dispatch.execute(() => new Promise<string>((r) => { resolveFirst = () => r('a'); }));
    const p2 = dispatch.execute(() => new Promise<string>((r) => { resolveSecond = () => r('b'); }));

    // Both should be running now
    assert.equal(dispatch.currentConcurrency, 2);
    assert.equal(dispatch.queueLength, 0);

    // Add a third task — should queue
    const p3 = dispatch.execute(async () => 'c');
    assert.equal(dispatch.queueLength, 1);

    resolveFirst();
    await p1;

    // After first completes, queued task should start
    await delay(10);
    assert.equal(dispatch.queueLength, 0);

    resolveSecond();
    await p2;
    await p3;

    assert.equal(dispatch.currentConcurrency, 0);
  });

  it('should default to maxParallel=10', async () => {
    const dispatch = new ParallelDispatch();
    const tasks = Array.from({ length: 15 }, (_, i) =>
      dispatch.execute(async () => {
        await delay(10);
        return i;
      }),
    );

    await Promise.all(tasks);
    assert.ok(dispatch.peakConcurrency <= 10);
    assert.equal(dispatch.totalDispatched, 15);
  });
});
