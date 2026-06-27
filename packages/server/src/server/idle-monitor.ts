import type { SessionStore } from '../db/session-store.js';
import type { ContainerManager } from '../sandbox/container-manager.js';

/**
 * IdleMonitor — background cleanup loop for idle sessions.
 *
 * - Sends idle_warning events at warningMinutes (default: 55 min)
 * - Pauses containers at idleTimeoutMs (default: 60 min)
 * - Destroys containers at destroyAfterMs (default: 24 hours)
 */

export interface IdleMonitorConfig {
  /** Idle timeout in milliseconds (default: 60 minutes). */
  idleTimeoutMs?: number;
  /** Minutes before idle timeout to send a warning (default: 5 min before). */
  warningMinutes?: number;
  /** Time after pause before container is destroyed (default: 24 hours). */
  destroyAfterMs?: number;
  /** Interval between cleanup checks in ms (default: 60 seconds). */
  checkIntervalMs?: number;
}

export interface IdleWarningCallback {
  (sessionId: string, minutesRemaining: number): void;
}

interface SessionState {
  id: string;
  containerId: string;
  status: string;
}

export class IdleMonitor {
  private sessionStore: SessionStore;
  private containerManager: ContainerManager;
  private sessions: Map<string, SessionState>;
  private onWarning: IdleWarningCallback | null = null;

  private idleTimeoutMs: number;
  private warningMs: number;
  private destroyAfterMs: number;
  private checkIntervalMs: number;

  private intervalHandle: ReturnType<typeof setInterval> | null = null;
  /** Track which sessions already received their warning to avoid spamming. */
  private warnedSessions = new Set<string>();

  constructor(
    sessionStore: SessionStore,
    containerManager: ContainerManager,
    sessions: Map<string, SessionState>,
    config?: IdleMonitorConfig,
  ) {
    this.sessionStore = sessionStore;
    this.containerManager = containerManager;
    this.sessions = sessions;

    this.idleTimeoutMs = config?.idleTimeoutMs ?? 60 * 60 * 1000; // 60 min
    const warningBeforeMs = (config?.warningMinutes ?? 5) * 60 * 1000; // 5 min before timeout
    this.warningMs = this.idleTimeoutMs - warningBeforeMs;            // start warning at this idle time
    this.destroyAfterMs = config?.destroyAfterMs ?? 24 * 60 * 60 * 1000; // 24 hours
    this.checkIntervalMs = config?.checkIntervalMs ?? 60 * 1000; // 1 min
  }

  /**
   * Register a callback for idle warnings.
   * Called with (sessionId, minutesRemaining).
   */
  setWarningCallback(cb: IdleWarningCallback): void {
    this.onWarning = cb;
  }

  /** Start the background cleanup loop. */
  start(): void {
    if (this.intervalHandle) return;
    this.intervalHandle = setInterval(() => {
      this.check();
    }, this.checkIntervalMs);
  }

  /** Stop the background cleanup loop. */
  stop(): void {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
  }

  /** Run a single check cycle (also useful for testing). */
  check(): void {
    const now = Date.now();
    const activeSessions = this.sessionStore.listActive();

    for (const row of activeSessions) {
      const lastActive = new Date(row.last_active_at).getTime();
      const idleMs = now - lastActive;
      const liveSession = this.sessions.get(row.id);

      // Skip sessions that are currently running
      if (liveSession?.status === 'running') continue;

      // Phase 1: Idle warning (e.g., at 55 minutes)
      if (idleMs >= this.warningMs && idleMs < this.idleTimeoutMs) {
        if (!this.warnedSessions.has(row.id)) {
          this.warnedSessions.add(row.id);
          const minutesRemaining = Math.ceil((this.idleTimeoutMs - idleMs) / 60_000);
          if (this.onWarning) {
            this.onWarning(row.id, minutesRemaining);
          }
        }
        continue;
      }

      // Phase 2: Idle timeout — pause the container
      if (idleMs >= this.idleTimeoutMs && idleMs < this.destroyAfterMs) {
        if (row.status !== 'paused') {
          this.pauseSession(row.id, row.container_id);
        }
        continue;
      }

      // Phase 3: Destroy after extended idle
      if (idleMs >= this.destroyAfterMs) {
        this.destroySession(row.id, row.container_id);
      }
    }
  }

  private pauseSession(sessionId: string, containerId: string | null): void {
    // Update DB
    this.sessionStore.update(sessionId, { status: 'paused' });

    // Pause container if it exists
    if (containerId) {
      try {
        this.containerManager.pause(containerId).catch(() => {});
      } catch {
        // Container may already be gone
      }
    }

    // Update in-memory state
    const live = this.sessions.get(sessionId);
    if (live) {
      live.status = 'paused';
    }

    this.warnedSessions.delete(sessionId);
  }

  private destroySession(sessionId: string, containerId: string | null): void {
    // Destroy container
    if (containerId) {
      try {
        this.containerManager.destroy(containerId).catch(() => {});
      } catch {
        // Container may already be gone
      }
    }

    // Terminate in DB
    this.sessionStore.terminate(sessionId);

    // Remove from in-memory
    this.sessions.delete(sessionId);
    this.warnedSessions.delete(sessionId);
  }
}
