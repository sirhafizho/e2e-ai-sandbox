/**
 * ParallelDispatch — concurrency limiter for tool execution.
 *
 * When the LLM returns multiple tool calls in a single step, the AI SDK
 * calls each tool's execute() concurrently. This class limits the number
 * of concurrent executions and provides tracking of parallel dispatch.
 */

const DEFAULT_MAX_PARALLEL = 10;

export class ParallelDispatch {
  private maxParallel: number;
  private running = 0;
  private queue: Array<{
    fn: () => Promise<unknown>;
    resolve: (value: unknown) => void;
    reject: (error: unknown) => void;
  }> = [];

  /** Total number of tasks dispatched. */
  totalDispatched = 0;
  /** Maximum concurrent tasks observed. */
  peakConcurrency = 0;

  constructor(maxParallel: number = DEFAULT_MAX_PARALLEL) {
    this.maxParallel = maxParallel;
  }

  /**
   * Execute a function with concurrency limiting.
   * If the limit is reached, the call queues and waits.
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    this.totalDispatched++;

    if (this.running < this.maxParallel) {
      return this.run(fn);
    }

    // Queue and wait
    return new Promise<T>((resolve, reject) => {
      this.queue.push({
        fn: fn as () => Promise<unknown>,
        resolve: resolve as (value: unknown) => void,
        reject,
      });
    });
  }

  private async run<T>(fn: () => Promise<T>): Promise<T> {
    this.running++;
    if (this.running > this.peakConcurrency) {
      this.peakConcurrency = this.running;
    }

    try {
      const result = await fn();
      return result;
    } finally {
      this.running--;
      this.drain();
    }
  }

  private drain(): void {
    if (this.queue.length > 0 && this.running < this.maxParallel) {
      const next = this.queue.shift()!;
      this.run(next.fn).then(next.resolve, next.reject);
    }
  }

  /** Current number of running tasks. */
  get currentConcurrency(): number {
    return this.running;
  }

  /** Number of queued (waiting) tasks. */
  get queueLength(): number {
    return this.queue.length;
  }
}
