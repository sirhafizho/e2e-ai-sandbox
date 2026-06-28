import Docker from 'dockerode';
import type { Blueprint, ParseResult } from './blueprint.js';
import { snapshotImageTag } from './blueprint.js';

export interface BuildProgress {
  step: string;
  detail: string;
  index: number;
  total: number;
}

export type ProgressCallback = (progress: BuildProgress) => void;

export interface BuildOptions {
  /** Force rebuild even if cached image exists */
  noCache?: boolean;
  /** Progress callback for streaming build status */
  onProgress?: ProgressCallback;
}

export interface BuildResult {
  imageTag: string;
  cached: boolean;
  steps: StepResult[];
  durationMs: number;
}

export interface StepResult {
  step: string;
  durationMs: number;
  success: boolean;
  output?: string;
  error?: string;
}

export class SnapshotBuilder {
  private docker: Docker;

  constructor(docker?: Docker) {
    this.docker = docker ?? new Docker();
  }

  /**
   * Build a snapshot image from a parsed blueprint.
   * If a cached image with the same hash exists and noCache is false, returns immediately.
   */
  async build(parseResult: ParseResult, options: BuildOptions = {}): Promise<BuildResult> {
    const { blueprint, hash } = parseResult;
    const { noCache = false, onProgress } = options;
    const start = Date.now();
    const imageTag = snapshotImageTag(blueprint.name, hash);
    const steps: StepResult[] = [];

    // Check cache
    if (!noCache) {
      const cached = await this.imageExists(imageTag);
      if (cached) {
        onProgress?.({
          step: 'cache',
          detail: `Using cached image ${imageTag}`,
          index: 0,
          total: 1,
        });
        return { imageTag, cached: true, steps: [], durationMs: Date.now() - start };
      }
    }

    // Calculate total steps for progress
    const totalSteps =
      1 + // create container
      (blueprint.repos.length > 0 ? 1 : 0) + // clone repos
      (blueprint.tools.length > 0 ? 1 : 0) + // install tools
      blueprint.setup.length + // setup commands
      (Object.keys(blueprint.env).length > 0 ? 1 : 0) + // env vars
      (blueprint.health_check.length > 0 ? 1 : 0) + // health checks
      1; // commit

    let stepIndex = 0;

    // Step 1: Create temp container from base image
    const report = (step: string, detail: string) => {
      onProgress?.({ step, detail, index: stepIndex++, total: totalSteps });
    };

    report('create', `Creating container from ${blueprint.base}`);
    const container = await this.createTempContainer(blueprint.base);
    const containerId = container.id;

    try {
      // Step 2: Clone repos
      if (blueprint.repos.length > 0) {
        report('repos', `Cloning ${blueprint.repos.length} repo(s)`);
        const repoStep = await this.cloneRepos(containerId, blueprint.repos);
        steps.push(repoStep);
        if (!repoStep.success) {
          return { imageTag, cached: false, steps, durationMs: Date.now() - start };
        }
      }

      // Step 3: Install additional tools
      if (blueprint.tools.length > 0) {
        report('tools', `Installing tools: ${blueprint.tools.join(', ')}`);
        const toolStep = await this.installTools(containerId, blueprint.tools);
        steps.push(toolStep);
        if (!toolStep.success) {
          return { imageTag, cached: false, steps, durationMs: Date.now() - start };
        }
      }

      // Step 4: Run setup commands
      for (const cmd of blueprint.setup) {
        const shortCmd = cmd.length > 60 ? cmd.slice(0, 57) + '...' : cmd;
        report('setup', shortCmd);
        const setupStep = await this.runCommand(containerId, cmd, `setup: ${shortCmd}`);
        steps.push(setupStep);
        if (!setupStep.success) {
          return { imageTag, cached: false, steps, durationMs: Date.now() - start };
        }
      }

      // Step 5: Set environment variables (write to /etc/environment)
      if (Object.keys(blueprint.env).length > 0) {
        report('env', `Setting ${Object.keys(blueprint.env).length} env var(s)`);
        const envStep = await this.setEnvVars(containerId, blueprint.env);
        steps.push(envStep);
        if (!envStep.success) {
          return { imageTag, cached: false, steps, durationMs: Date.now() - start };
        }
      }

      // Step 6: Run health checks
      if (blueprint.health_check.length > 0) {
        report('health_check', `Running ${blueprint.health_check.length} health check(s)`);
        const healthStep = await this.runHealthChecks(containerId, blueprint.health_check);
        steps.push(healthStep);
        if (!healthStep.success) {
          return { imageTag, cached: false, steps, durationMs: Date.now() - start };
        }
      }

      // Step 7: Commit container as image
      report('commit', `Committing image as ${imageTag}`);
      const commitStep = await this.commitImage(containerId, imageTag, blueprint);
      steps.push(commitStep);

      return { imageTag, cached: false, steps, durationMs: Date.now() - start };
    } finally {
      // Always clean up the temp container
      await this.cleanupContainer(containerId);
    }
  }

  /**
   * Check if an image with the given tag exists locally.
   */
  async imageExists(imageTag: string): Promise<boolean> {
    try {
      await this.docker.getImage(imageTag).inspect();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * List all forge-snapshot images.
   */
  async listSnapshots(): Promise<SnapshotInfo[]> {
    const images = await this.docker.listImages({
      filters: { reference: ['forge-snapshot'] },
    });

    return images.map((img) => {
      const tag = img.RepoTags?.[0] ?? 'untagged';
      return {
        imageId: img.Id,
        tag,
        size: img.Size,
        created: new Date(img.Created * 1000).toISOString(),
        labels: img.Labels ?? {},
      };
    });
  }

  /**
   * Remove a snapshot image by tag.
   */
  async removeSnapshot(imageTag: string): Promise<void> {
    await this.docker.getImage(imageTag).remove({ force: true });
  }

  /**
   * Inspect a snapshot image and return details.
   */
  async inspectSnapshot(imageTag: string): Promise<SnapshotDetail> {
    const info = await this.docker.getImage(imageTag).inspect();
    return {
      imageId: info.Id,
      tag: imageTag,
      size: info.Size,
      created: info.Created,
      labels: info.Config.Labels ?? {},
      envVars: info.Config.Env ?? [],
      layers: info.RootFS.Layers ?? [],
    };
  }

  // --- Private helpers ---

  private async createTempContainer(baseImage: string): Promise<Docker.Container> {
    const container = await this.docker.createContainer({
      Image: baseImage,
      Cmd: ['sleep', 'infinity'],
      WorkingDir: '/workspace',
      User: 'root', // Need root for installs, cloning, etc.
      Labels: {
        'forge.managed': 'true',
        'forge.snapshot-build': 'true',
      },
    });
    await container.start();
    return container;
  }

  private async cloneRepos(
    containerId: string,
    repos: Blueprint['repos'],
  ): Promise<StepResult> {
    const start = Date.now();
    const outputs: string[] = [];

    for (const repo of repos) {
      // Ensure parent directory exists
      const parentDir = repo.path.replace(/\/[^/]+$/, '');
      const mkdirResult = await this.execInContainer(containerId, `mkdir -p ${parentDir}`);
      if (mkdirResult.exitCode !== 0) {
        return {
          step: 'repos',
          durationMs: Date.now() - start,
          success: false,
          error: `Failed to create directory ${parentDir}: ${mkdirResult.stderr}`,
        };
      }

      const branchFlag = repo.branch ? `-b ${repo.branch}` : '';
      const cmd = `git clone --depth 1 ${branchFlag} ${repo.url} ${repo.path}`;
      const result = await this.execInContainer(containerId, cmd);
      outputs.push(result.stdout || result.stderr);
      if (result.exitCode !== 0) {
        return {
          step: 'repos',
          durationMs: Date.now() - start,
          success: false,
          output: outputs.join('\n'),
          error: `Failed to clone ${repo.url}: ${result.stderr}`,
        };
      }

      // Fix ownership so forge user can access
      await this.execInContainer(containerId, `chown -R forge:forge ${repo.path}`);
    }

    return {
      step: 'repos',
      durationMs: Date.now() - start,
      success: true,
      output: outputs.join('\n'),
    };
  }

  private async installTools(containerId: string, tools: string[]): Promise<StepResult> {
    const start = Date.now();
    const outputs: string[] = [];

    // Map tool names to install commands
    const toolCommands: Record<string, string> = {
      rust: 'curl --proto "=https" --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y',
      go: 'apt-get update && apt-get install -y golang',
      java: 'apt-get update && apt-get install -y default-jdk',
      ruby: 'apt-get update && apt-get install -y ruby-full',
      php: 'apt-get update && apt-get install -y php',
      dotnet: 'apt-get update && apt-get install -y dotnet-sdk-8.0',
    };

    for (const tool of tools) {
      const cmd = toolCommands[tool] ?? `apt-get update && apt-get install -y ${tool}`;
      const result = await this.execInContainer(containerId, cmd, 300_000); // 5 min timeout
      outputs.push(`[${tool}] ${result.stdout || result.stderr}`);
      if (result.exitCode !== 0) {
        return {
          step: 'tools',
          durationMs: Date.now() - start,
          success: false,
          output: outputs.join('\n'),
          error: `Failed to install ${tool}: ${result.stderr}`,
        };
      }
    }

    return {
      step: 'tools',
      durationMs: Date.now() - start,
      success: true,
      output: outputs.join('\n'),
    };
  }

  private async runCommand(containerId: string, cmd: string, stepName: string): Promise<StepResult> {
    const start = Date.now();
    const result = await this.execInContainer(containerId, cmd, 600_000); // 10 min timeout
    return {
      step: stepName,
      durationMs: Date.now() - start,
      success: result.exitCode === 0,
      output: result.stdout,
      error: result.exitCode !== 0 ? result.stderr || `Exit code: ${result.exitCode}` : undefined,
    };
  }

  private async setEnvVars(
    containerId: string,
    env: Record<string, string>,
  ): Promise<StepResult> {
    const start = Date.now();

    // Write env vars to /etc/environment and to a profile.d script
    const envLines = Object.entries(env)
      .map(([k, v]) => `${k}="${v}"`)
      .join('\n');
    const cmd = `echo '${envLines.replace(/'/g, "'\\''")}' >> /etc/environment && mkdir -p /etc/profile.d && echo '${envLines.replace(/'/g, "'\\''")}' | sed 's/^/export /' > /etc/profile.d/forge-env.sh`;
    const result = await this.execInContainer(containerId, cmd);

    return {
      step: 'env',
      durationMs: Date.now() - start,
      success: result.exitCode === 0,
      output: result.stdout,
      error: result.exitCode !== 0 ? result.stderr : undefined,
    };
  }

  private async runHealthChecks(
    containerId: string,
    checks: string[],
  ): Promise<StepResult> {
    const start = Date.now();
    const outputs: string[] = [];

    for (const check of checks) {
      const result = await this.execInContainer(containerId, check);
      outputs.push(`[${check}] exit=${result.exitCode} ${result.stdout.trim()}`);
      if (result.exitCode !== 0) {
        return {
          step: 'health_check',
          durationMs: Date.now() - start,
          success: false,
          output: outputs.join('\n'),
          error: `Health check failed: ${check}\n${result.stderr}`,
        };
      }
    }

    return {
      step: 'health_check',
      durationMs: Date.now() - start,
      success: true,
      output: outputs.join('\n'),
    };
  }

  private async commitImage(
    containerId: string,
    imageTag: string,
    blueprint: Blueprint,
  ): Promise<StepResult> {
    const start = Date.now();
    const [repo, tag] = imageTag.split(':');

    try {
      const container = this.docker.getContainer(containerId);

      // Build env config for the committed image
      const envArray = Object.entries(blueprint.env).map(([k, v]) => `${k}=${v}`);

      await container.commit({
        repo,
        tag,
        comment: `Forge snapshot: ${blueprint.name}`,
        author: 'forge',
        changes: envArray.length > 0
          ? envArray.map((e) => `ENV ${e}`)
          : undefined,
      });

      // Add labels via tag (Docker API commit has limited label support)
      // The image is already tagged, labels are set via the container's config

      return {
        step: 'commit',
        durationMs: Date.now() - start,
        success: true,
        output: `Image committed as ${imageTag}`,
      };
    } catch (err) {
      return {
        step: 'commit',
        durationMs: Date.now() - start,
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  private async cleanupContainer(containerId: string): Promise<void> {
    try {
      const container = this.docker.getContainer(containerId);
      await container.stop({ t: 2 });
      await container.remove({ force: true });
    } catch {
      // Best-effort cleanup
    }
  }

  private async execInContainer(
    containerId: string,
    command: string,
    timeoutMs = 120_000,
  ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    const container = this.docker.getContainer(containerId);

    const exec = await container.exec({
      Cmd: ['bash', '-c', command],
      AttachStdout: true,
      AttachStderr: true,
    });

    return new Promise((resolve, reject) => {
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
        let pendingBuf: Buffer = Buffer.alloc(0);

        stream.on('data', (chunk: Buffer) => {
          const buf = pendingBuf.length > 0 ? Buffer.concat([pendingBuf, chunk]) : chunk;
          let offset = 0;
          while (offset < buf.length) {
            if (offset + 8 > buf.length) break;
            const streamType = buf[offset];
            const size = buf.readUInt32BE(offset + 4);
            offset += 8;
            if (offset + size > buf.length) { offset -= 8; break; }
            const data = buf.subarray(offset, offset + size);
            if (streamType === 1) {
              stdoutChunks.push(Buffer.from(data));
            } else if (streamType === 2) {
              stderrChunks.push(Buffer.from(data));
            }
            offset += size;
          }
          pendingBuf = offset < buf.length ? Buffer.from(buf.subarray(offset)) : Buffer.alloc(0);
        });

        stream.on('end', async () => {
          clearTimeout(timer);
          try {
            const inspectResult = await exec.inspect();
            resolve({
              stdout: Buffer.concat(stdoutChunks).toString('utf-8'),
              stderr: Buffer.concat(stderrChunks).toString('utf-8'),
              exitCode: inspectResult.ExitCode ?? -1,
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
}

export interface SnapshotInfo {
  imageId: string;
  tag: string;
  size: number;
  created: string;
  labels: Record<string, string>;
}

export interface SnapshotDetail {
  imageId: string;
  tag: string;
  size: number;
  created: string;
  labels: Record<string, string>;
  envVars: string[];
  layers: string[];
}
