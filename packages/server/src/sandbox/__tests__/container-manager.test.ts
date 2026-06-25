import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import { ContainerManager } from '../container-manager.js';

describe('ContainerManager', () => {
  const manager = new ContainerManager();
  const containersToClean: string[] = [];

  after(async () => {
    for (const id of containersToClean) {
      try {
        await manager.destroy(id);
      } catch {
        // Already removed
      }
    }
  });

  it('should create and destroy a container', async () => {
    const info = await manager.create({ sessionId: 'test-create' });
    containersToClean.push(info.containerId);

    assert.ok(info.containerId);
    assert.equal(info.image, 'forge-sandbox:base');
    assert.equal(info.status, 'running');

    await manager.destroy(info.containerId);
    containersToClean.pop();
  });

  it('should report container status', async () => {
    const info = await manager.create({ sessionId: 'test-status' });
    containersToClean.push(info.containerId);

    const status = await manager.getStatus(info.containerId);
    assert.equal(status, 'running');
  });

  it('should execute a command and return output', async () => {
    const info = await manager.create({ sessionId: 'test-exec' });
    containersToClean.push(info.containerId);

    const result = await manager.exec(info.containerId, 'echo "hello forge"');
    assert.equal(result.stdout.trim(), 'hello forge');
    assert.equal(result.exitCode, 0);
    assert.ok(result.durationMs >= 0);
  });

  it('should capture stderr separately', async () => {
    const info = await manager.create({ sessionId: 'test-stderr' });
    containersToClean.push(info.containerId);

    const result = await manager.exec(info.containerId, 'echo "out" && echo "err" >&2');
    assert.equal(result.stdout.trim(), 'out');
    assert.equal(result.stderr.trim(), 'err');
    assert.equal(result.exitCode, 0);
  });

  it('should return non-zero exit code on failure', async () => {
    const info = await manager.create({ sessionId: 'test-fail' });
    containersToClean.push(info.containerId);

    const result = await manager.exec(info.containerId, 'exit 42');
    assert.equal(result.exitCode, 42);
  });

  it('should pass health check', async () => {
    const info = await manager.create({ sessionId: 'test-health' });
    containersToClean.push(info.containerId);

    const health = await manager.healthCheck(info.containerId);
    assert.equal(health.healthy, true);
    assert.ok(health.checks['bash']?.passed);
    assert.ok(health.checks['git']?.passed);
    assert.ok(health.checks['node']?.passed);
    assert.ok(health.checks['python3']?.passed);
    assert.ok(health.durationMs >= 0);
  });

  it('should stream command output', async () => {
    const info = await manager.create({ sessionId: 'test-stream' });
    containersToClean.push(info.containerId);

    const chunks: string[] = [];
    for await (const chunk of manager.execStream(
      info.containerId,
      'echo "line1" && echo "line2"',
    )) {
      chunks.push(chunk);
    }

    const output = chunks.join('');
    assert.ok(output.includes('line1'));
    assert.ok(output.includes('line2'));
  });

  it('should execute in /workspace by default', async () => {
    const info = await manager.create({ sessionId: 'test-cwd' });
    containersToClean.push(info.containerId);

    const result = await manager.exec(info.containerId, 'pwd');
    assert.equal(result.stdout.trim(), '/workspace');
  });

  it('should run as user forge', async () => {
    const info = await manager.create({ sessionId: 'test-user' });
    containersToClean.push(info.containerId);

    const result = await manager.exec(info.containerId, 'whoami');
    assert.equal(result.stdout.trim(), 'forge');
  });
});
