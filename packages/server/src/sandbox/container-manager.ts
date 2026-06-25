import Docker from 'dockerode';
import type {
  CreateContainerOptions,
  ContainerInfo,
  ContainerStatus,
  HealthResult,
  ExecOptions,
  ExecResult,
} from './types.js';

const DEFAULT_IMAGE = 'forge-sandbox:base';
const DEFAULT_CPU_LIMIT = 2;
const DEFAULT_MEMORY_LIMIT = 4 * 1024 * 1024 * 1024; // 4GB
const DEFAULT_PID_LIMIT = 256;
const DEFAULT_EXEC_TIMEOUT = 120_000; // 120s
const HEALTH_CHECK_TIMEOUT = 30_000; // 30s

export class ContainerManager {
  private docker: Docker;

  constructor(docker?: Docker) {
    this.docker = docker ?? new Docker();
  }

  async create(options: CreateContainerOptions = {}): Promise<ContainerInfo> {
    const {
      image = DEFAULT_IMAGE,
      workspacePath,
      cpuLimit = DEFAULT_CPU_LIMIT,
      memoryLimit = DEFAULT_MEMORY_LIMIT,
      pidLimit = DEFAULT_PID_LIMIT,
      sessionId,
    } = options;

    const binds: string[] = [];
    if (workspacePath) {
      binds.push(`${workspacePath}:/workspace`);
    }

    const container = await this.docker.createContainer({
      Image: image,
      Cmd: ['sleep', 'infinity'],
      Labels: {
        'forge.managed': 'true',
        ...(sessionId ? { 'forge.session': sessionId } : {}),
      },
      WorkingDir: '/workspace',
      User: 'forge',
      HostConfig: {
        Binds: binds.length > 0 ? binds : undefined,
        NanoCpus: cpuLimit * 1e9,
        Memory: memoryLimit,
        PidsLimit: pidLimit,
        CapDrop: ['ALL'],
        SecurityOpt: ['no-new-privileges'],
        ReadonlyRootfs: false,
      },
    });

    await container.start();

    const info = await container.inspect();

    return {
      containerId: container.id,
      image,
      status: this.mapStatus(info.State.Status),
      createdAt: info.Created,
    };
  }

  async healthCheck(containerId: string): Promise<HealthResult> {
    const start = Date.now();
    const checks: Record<
      string,
      { name: string; passed: boolean; output?: string; error?: string }
    > = {};

    const commands = [
      { name: 'bash', cmd: 'bash --version' },
      { name: 'git', cmd: 'git --version' },
      { name: 'node', cmd: 'node --version' },
      { name: 'python3', cmd: 'python3 --version' },
    ];

    for (const { name, cmd } of commands) {
      try {
        const result = await this.exec(containerId, cmd, {
          timeoutMs: HEALTH_CHECK_TIMEOUT,
        });
        checks[name] = {
          name,
          passed: result.exitCode === 0,
          output: result.stdout.trim() || result.stderr.trim(),
          error: result.exitCode !== 0 ? `Exit code: ${result.exitCode}` : undefined,
        };
      } catch (err) {
        checks[name] = {
          name,
          passed: false,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    }

    const healthy = Object.values(checks).every((c) => c.passed);

    return {
      healthy,
      checks,
      durationMs: Date.now() - start,
    };
  }

  async exec(containerId: string, command: string, options: ExecOptions = {}): Promise<ExecResult> {
    const { cwd, timeoutMs = DEFAULT_EXEC_TIMEOUT, env } = options;
    const container = this.docker.getContainer(containerId);
    const start = Date.now();

    const shellCmd = cwd ? `cd ${cwd} && ${command}` : command;
    const envArray = env ? Object.entries(env).map(([k, v]) => `${k}=${v}`) : undefined;

    const exec = await container.exec({
      Cmd: ['bash', '-c', shellCmd],
      AttachStdout: true,
      AttachStderr: true,
      WorkingDir: cwd,
      Env: envArray,
    });

    return new Promise<ExecResult>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Command timed out after ${timeoutMs}ms: ${command}`));
      }, timeoutMs);

      exec.start({ hijack: true, stdin: false }, (err, stream) => {
        if (err || !stream) {
          clearTimeout(timer);
          reject(err ?? new Error('Failed to start exec stream'));
          return;
        }

        const stdoutChunks: Buffer[] = [];
        const stderrChunks: Buffer[] = [];

        // Docker multiplexes stdout/stderr into a single stream with 8-byte headers
        stream.on('data', (chunk: Buffer) => {
          // Parse the docker multiplex header
          let offset = 0;
          while (offset < chunk.length) {
            if (offset + 8 > chunk.length) break;
            const streamType = chunk[offset];
            const size = chunk.readUInt32BE(offset + 4);
            offset += 8;
            if (offset + size > chunk.length) break;
            const data = chunk.subarray(offset, offset + size);
            if (streamType === 1) {
              stdoutChunks.push(data);
            } else if (streamType === 2) {
              stderrChunks.push(data);
            }
            offset += size;
          }
        });

        stream.on('end', async () => {
          clearTimeout(timer);
          try {
            const inspectResult = await exec.inspect();
            resolve({
              stdout: Buffer.concat(stdoutChunks).toString('utf-8'),
              stderr: Buffer.concat(stderrChunks).toString('utf-8'),
              exitCode: inspectResult.ExitCode ?? -1,
              durationMs: Date.now() - start,
            });
          } catch (inspectErr) {
            reject(inspectErr);
          }
        });

        stream.on('error', (streamErr: Error) => {
          clearTimeout(timer);
          reject(streamErr);
        });
      });
    });
  }

  async *execStream(
    containerId: string,
    command: string,
    options: ExecOptions = {},
  ): AsyncGenerator<string> {
    const { cwd, timeoutMs = DEFAULT_EXEC_TIMEOUT, env } = options;
    const container = this.docker.getContainer(containerId);

    const shellCmd = cwd ? `cd ${cwd} && ${command}` : command;
    const envArray = env ? Object.entries(env).map(([k, v]) => `${k}=${v}`) : undefined;

    const exec = await container.exec({
      Cmd: ['bash', '-c', shellCmd],
      AttachStdout: true,
      AttachStderr: true,
      WorkingDir: cwd,
      Env: envArray,
    });

    const stream = await exec.start({ hijack: true, stdin: false });

    const iterator = this.parseDockerStream(stream, timeoutMs);
    for await (const chunk of iterator) {
      yield chunk;
    }
  }

  async destroy(containerId: string): Promise<void> {
    const container = this.docker.getContainer(containerId);
    try {
      await container.stop({ t: 5 });
    } catch {
      // Container may already be stopped
    }
    await container.remove({ force: true });
  }

  async getStatus(containerId: string): Promise<ContainerStatus> {
    const container = this.docker.getContainer(containerId);
    const info = await container.inspect();
    return this.mapStatus(info.State.Status);
  }

  private mapStatus(dockerStatus: string): ContainerStatus {
    switch (dockerStatus) {
      case 'created':
        return 'created';
      case 'running':
        return 'running';
      case 'paused':
        return 'paused';
      case 'exited':
      case 'dead':
        return 'stopped';
      case 'removing':
        return 'removed';
      default:
        return 'stopped';
    }
  }

  private async *parseDockerStream(
    stream: NodeJS.ReadableStream,
    timeoutMs: number,
  ): AsyncGenerator<string> {
    let timer: ReturnType<typeof setTimeout> | undefined;

    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        reject(new Error(`Stream timed out after ${timeoutMs}ms`));
      }, timeoutMs);
    });

    try {
      const reader = stream[Symbol.asyncIterator]();

      while (true) {
        const result = (await Promise.race([
          reader.next(),
          timeoutPromise,
        ])) as IteratorResult<Buffer>;
        if (result.done) break;

        const chunk = result.value;
        let offset = 0;
        while (offset < chunk.length) {
          if (offset + 8 > chunk.length) break;
          const size = chunk.readUInt32BE(offset + 4);
          offset += 8;
          if (offset + size > chunk.length) break;
          const data = chunk.subarray(offset, offset + size);
          yield data.toString('utf-8');
          offset += size;
        }
      }
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}
