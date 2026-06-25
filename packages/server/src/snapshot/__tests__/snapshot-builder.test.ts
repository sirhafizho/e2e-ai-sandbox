import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { SnapshotBuilder } from '../snapshot-builder.js';
import { parseBlueprint } from '../blueprint.js';
import type { BuildProgress } from '../snapshot-builder.js';

// --- Stub Docker ---

function createMockExecStream(
  stdout: string,
  stderr: string,
  exitCode: number,
) {
  return {
    start: (_opts: unknown, cb: (err: Error | null, stream: unknown) => void) => {
      const stdoutBuf = Buffer.from(stdout);
      const stderrBuf = Buffer.from(stderr);
      const chunks: Buffer[] = [];

      // Build docker multiplex frames
      if (stdoutBuf.length > 0) {
        const header = Buffer.alloc(8);
        header[0] = 1; // stdout stream type
        header.writeUInt32BE(stdoutBuf.length, 4);
        chunks.push(Buffer.concat([header, stdoutBuf]));
      }
      if (stderrBuf.length > 0) {
        const header = Buffer.alloc(8);
        header[0] = 2; // stderr stream type
        header.writeUInt32BE(stderrBuf.length, 4);
        chunks.push(Buffer.concat([header, stderrBuf]));
      }

      const stream = {
        on: (event: string, handler: (...args: unknown[]) => void) => {
          if (event === 'data') {
            for (const chunk of chunks) handler(chunk);
          }
          if (event === 'end') {
            setTimeout(() => handler(), 0);
          }
        },
      };

      cb(null, stream);
    },
    inspect: async () => ({ ExitCode: exitCode }),
  };
}

function createMockContainer(opts: {
  id: string;
  execResults?: Array<{ stdout: string; stderr: string; exitCode: number }>;
}) {
  let execCallIndex = 0;
  const defaultResult = { stdout: '', stderr: '', exitCode: 0 };
  const results = opts.execResults ?? [];

  return {
    id: opts.id,
    start: async () => {},
    stop: async () => {},
    remove: async () => {},
    exec: async () => {
      const result = results[execCallIndex] ?? defaultResult;
      execCallIndex++;
      return createMockExecStream(result.stdout, result.stderr, result.exitCode);
    },
    commit: async () => {},
    inspect: async () => ({
      State: { Status: 'running' },
      Created: new Date().toISOString(),
      Config: { Labels: {} },
    }),
  };
}

function createMockDocker(opts?: {
  imageExists?: boolean;
  container?: ReturnType<typeof createMockContainer>;
}) {
  const container = opts?.container ?? createMockContainer({ id: 'test-container-123' });
  const imageExistsVal = opts?.imageExists ?? false;

  return {
    createContainer: async () => container,
    getContainer: () => container,
    getImage: () => ({
      inspect: async () => {
        if (!imageExistsVal) throw new Error('Image not found');
        return {
          Id: 'sha256:abc123',
          Size: 1024 * 1024 * 100,
          Created: new Date().toISOString(),
          Config: { Labels: {}, Env: [] },
          RootFS: { Layers: [] },
        };
      },
      remove: async () => {},
    }),
    listImages: async () => [],
  } as unknown;
}

const MINIMAL_YAML = 'name: test-env\n';
const FULL_YAML = `
name: my-project
base: forge-sandbox:latest
repos:
  - url: https://github.com/user/repo
    path: /workspace/repo
    branch: main
setup:
  - cd /workspace/repo && npm install
tools:
  - rust
env:
  NODE_ENV: development
health_check:
  - node --version
`;

describe('SnapshotBuilder', () => {
  let builder: SnapshotBuilder;

  beforeEach(() => {
    const docker = createMockDocker();
    builder = new SnapshotBuilder(docker as any);
  });

  it('should return cached result if image exists and noCache is false', async () => {
    const docker = createMockDocker({ imageExists: true });
    const cachedBuilder = new SnapshotBuilder(docker as any);
    const parsed = parseBlueprint(MINIMAL_YAML);

    const result = await cachedBuilder.build(parsed);
    assert.equal(result.cached, true);
    assert.ok(result.imageTag.startsWith('forge-snapshot:test-env-'));
    assert.equal(result.steps.length, 0);
  });

  it('should rebuild if noCache is true even when image exists', async () => {
    const docker = createMockDocker({ imageExists: true });
    const noCacheBuilder = new SnapshotBuilder(docker as any);
    const parsed = parseBlueprint(MINIMAL_YAML);

    const result = await noCacheBuilder.build(parsed, { noCache: true });
    assert.equal(result.cached, false);
    assert.ok(result.imageTag.startsWith('forge-snapshot:test-env-'));
  });

  it('should build a minimal snapshot (name only)', async () => {
    const parsed = parseBlueprint(MINIMAL_YAML);
    const result = await builder.build(parsed);

    assert.equal(result.cached, false);
    assert.ok(result.imageTag.startsWith('forge-snapshot:test-env-'));
    assert.ok(result.durationMs >= 0);
    // Only step should be the commit
    const commitSteps = result.steps.filter((s) => s.step === 'commit');
    assert.equal(commitSteps.length, 1);
    assert.equal(commitSteps[0]!.success, true);
  });

  it('should build a full snapshot with all steps', async () => {
    // Need enough exec results for all operations:
    // repos: mkdir + git clone + chown = 3 calls
    // tools: 1 install command
    // setup: 1 command
    // env: 1 command
    // health_check: 1 command
    const execResults = Array(10).fill({ stdout: 'ok', stderr: '', exitCode: 0 });
    const container = createMockContainer({ id: 'full-test', execResults });
    const docker = createMockDocker({ container });
    const fullBuilder = new SnapshotBuilder(docker as any);

    const parsed = parseBlueprint(FULL_YAML);
    const result = await fullBuilder.build(parsed);

    assert.equal(result.cached, false);
    assert.ok(result.imageTag.startsWith('forge-snapshot:my-project-'));

    const stepNames = result.steps.map((s) => s.step);
    assert.ok(stepNames.includes('repos'), 'Should have repos step');
    assert.ok(stepNames.includes('tools'), 'Should have tools step');
    assert.ok(stepNames.some((s) => s.startsWith('setup:')), 'Should have setup step');
    assert.ok(stepNames.includes('env'), 'Should have env step');
    assert.ok(stepNames.includes('health_check'), 'Should have health_check step');
    assert.ok(stepNames.includes('commit'), 'Should have commit step');

    for (const step of result.steps) {
      assert.equal(step.success, true, `Step ${step.step} should succeed`);
    }
  });

  it('should stop on setup command failure', async () => {
    const execResults = [
      { stdout: 'ok', stderr: '', exitCode: 0 }, // mkdir
      { stdout: 'ok', stderr: '', exitCode: 0 }, // git clone
      { stdout: '', stderr: '', exitCode: 0 },    // chown
      { stdout: '', stderr: 'install failed', exitCode: 1 }, // setup fails
    ];
    const container = createMockContainer({ id: 'fail-test', execResults });
    const docker = createMockDocker({ container });
    const failBuilder = new SnapshotBuilder(docker as any);

    const yaml = `
name: fail-env
repos:
  - url: https://github.com/user/repo
    path: /workspace/repo
setup:
  - npm install
`;
    const parsed = parseBlueprint(yaml);
    const result = await failBuilder.build(parsed);

    const failedSteps = result.steps.filter((s) => !s.success);
    assert.ok(failedSteps.length > 0, 'Should have a failed step');
    // Should not have a commit step since we failed early
    const commitSteps = result.steps.filter((s) => s.step === 'commit');
    assert.equal(commitSteps.length, 0, 'Should not commit on failure');
  });

  it('should stop on health check failure', async () => {
    const execResults = [
      { stdout: '', stderr: 'command not found', exitCode: 127 }, // health check fails
    ];
    const container = createMockContainer({ id: 'health-fail', execResults });
    const docker = createMockDocker({ container });
    const healthBuilder = new SnapshotBuilder(docker as any);

    const yaml = `
name: health-fail
health_check:
  - node --version
`;
    const parsed = parseBlueprint(yaml);
    const result = await healthBuilder.build(parsed);

    const healthStep = result.steps.find((s) => s.step === 'health_check');
    assert.ok(healthStep, 'Should have health_check step');
    assert.equal(healthStep!.success, false);
    assert.ok(healthStep!.error?.includes('Health check failed'));
  });

  it('should report progress via callback', async () => {
    const progress: BuildProgress[] = [];
    const parsed = parseBlueprint(MINIMAL_YAML);

    await builder.build(parsed, {
      onProgress: (p) => progress.push(p),
    });

    assert.ok(progress.length >= 2, `Expected at least 2 progress events, got ${progress.length}`);
    assert.equal(progress[0]!.step, 'create');
    assert.equal(progress[progress.length - 1]!.step, 'commit');
    // Each progress event should have valid index and total
    for (const p of progress) {
      assert.ok(p.index >= 0);
      assert.ok(p.total > 0);
      assert.ok(typeof p.detail === 'string');
    }
  });

  it('should list snapshots', async () => {
    const mockDocker = createMockDocker();
    const docker = {
      ...(mockDocker as Record<string, unknown>),
      listImages: async () => [
        {
          Id: 'sha256:abc123',
          RepoTags: ['forge-snapshot:test-abc123def456'],
          Size: 100 * 1024 * 1024,
          Created: 1719000000,
          Labels: {},
        },
      ],
    } as unknown;
    const listBuilder = new SnapshotBuilder(docker as any);

    const snapshots = await listBuilder.listSnapshots();
    assert.equal(snapshots.length, 1);
    assert.equal(snapshots[0]!.tag, 'forge-snapshot:test-abc123def456');
    assert.ok(snapshots[0]!.size > 0);
  });

  it('should generate correct image tag from blueprint', async () => {
    const parsed = parseBlueprint(MINIMAL_YAML);
    const result = await builder.build(parsed);

    // Tag should be forge-snapshot:{name}-{first12 of hash}
    assert.match(result.imageTag, /^forge-snapshot:test-env-[a-f0-9]{12}$/);
  });
});
