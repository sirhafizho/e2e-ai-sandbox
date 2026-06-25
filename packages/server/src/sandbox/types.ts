export interface CreateContainerOptions {
  /** Docker image to use (default: forge-sandbox:base) */
  image?: string;
  /** Host path to mount as /workspace */
  workspacePath?: string;
  /** CPU core limit (default: 2) */
  cpuLimit?: number;
  /** Memory limit in bytes (default: 4GB) */
  memoryLimit?: number;
  /** PID limit (default: 256) */
  pidLimit?: number;
  /** Session ID for labeling */
  sessionId?: string;
}

export interface ContainerInfo {
  containerId: string;
  image: string;
  status: ContainerStatus;
  createdAt: string;
}

export type ContainerStatus = 'created' | 'running' | 'paused' | 'stopped' | 'removed';

export interface HealthResult {
  healthy: boolean;
  checks: Record<string, HealthCheck>;
  durationMs: number;
}

export interface HealthCheck {
  name: string;
  passed: boolean;
  output?: string;
  error?: string;
}

export interface ExecOptions {
  /** Working directory inside the container */
  cwd?: string;
  /** Timeout in milliseconds (default: 120000) */
  timeoutMs?: number;
  /** Environment variables */
  env?: Record<string, string>;
}

export interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  durationMs: number;
}
