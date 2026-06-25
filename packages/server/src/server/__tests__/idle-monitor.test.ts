import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase, SessionStore } from '../../db/index.js';
import { IdleMonitor } from '../idle-monitor.js';
import type Database from 'better-sqlite3';

// Minimal stub for ContainerManager
function createStubContainerManager() {
  const paused: string[] = [];
  const destroyed: string[] = [];
  return {
    paused,
    destroyed,
    pause: async (id: string) => { paused.push(id); },
    unpause: async (id: string) => { void id; },
    destroy: async (id: string) => { destroyed.push(id); },
  } as any; // eslint-disable-line @typescript-eslint/no-explicit-any
}

describe('IdleMonitor', () => {
  let db: Database.Database;
  let store: SessionStore;

  beforeEach(() => {
    db = openDatabase(':memory:');
    store = new SessionStore(db);
  });

  it('should not warn or pause active sessions', () => {
    store.create({ id: 'ses_1', model: 'm1', containerId: 'c1' });
    // Just created — last_active_at is now

    const sessions = new Map<string, any>();
    sessions.set('ses_1', { id: 'ses_1', containerId: 'c1', status: 'ready' });

    const cm = createStubContainerManager();
    const warnings: Array<{ sessionId: string; minutesRemaining: number }> = [];

    const monitor = new IdleMonitor(store, cm, sessions, {
      idleTimeoutMs: 60 * 60 * 1000,
      warningMinutes: 55,
    });
    monitor.setWarningCallback((id, min) => warnings.push({ sessionId: id, minutesRemaining: min }));
    monitor.check();

    assert.equal(warnings.length, 0);
    assert.equal(cm.paused.length, 0);
    assert.equal(cm.destroyed.length, 0);
  });

  it('should send warning for idle sessions', () => {
    store.create({ id: 'ses_warn', model: 'm1', containerId: 'c1' });

    // Manually set last_active_at to 56 minutes ago
    const fiftyySixMinAgo = new Date(Date.now() - 56 * 60 * 1000).toISOString();
    db.prepare('UPDATE sessions SET last_active_at = ? WHERE id = ?').run(fiftyySixMinAgo, 'ses_warn');

    const sessions = new Map<string, any>();
    sessions.set('ses_warn', { id: 'ses_warn', containerId: 'c1', status: 'ready' });

    const cm = createStubContainerManager();
    const warnings: Array<{ sessionId: string; minutesRemaining: number }> = [];

    const monitor = new IdleMonitor(store, cm, sessions, {
      idleTimeoutMs: 60 * 60 * 1000,
      warningMinutes: 55,
    });
    monitor.setWarningCallback((id, min) => warnings.push({ sessionId: id, minutesRemaining: min }));
    monitor.check();

    assert.equal(warnings.length, 1);
    assert.equal(warnings[0]!.sessionId, 'ses_warn');
    assert.ok(warnings[0]!.minutesRemaining > 0 && warnings[0]!.minutesRemaining <= 5);
    assert.equal(cm.paused.length, 0);
  });

  it('should not send duplicate warnings', () => {
    store.create({ id: 'ses_dup', model: 'm1', containerId: 'c1' });
    const fiftySixMinAgo = new Date(Date.now() - 56 * 60 * 1000).toISOString();
    db.prepare('UPDATE sessions SET last_active_at = ? WHERE id = ?').run(fiftySixMinAgo, 'ses_dup');

    const sessions = new Map<string, any>();
    sessions.set('ses_dup', { id: 'ses_dup', containerId: 'c1', status: 'ready' });

    const cm = createStubContainerManager();
    const warnings: Array<{ sessionId: string }> = [];

    const monitor = new IdleMonitor(store, cm, sessions, {
      idleTimeoutMs: 60 * 60 * 1000,
      warningMinutes: 55,
    });
    monitor.setWarningCallback((id) => warnings.push({ sessionId: id }));

    monitor.check();
    monitor.check();
    monitor.check();

    assert.equal(warnings.length, 1);
  });

  it('should pause container at idle timeout', () => {
    store.create({ id: 'ses_pause', model: 'm1', containerId: 'c1' });
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    db.prepare('UPDATE sessions SET last_active_at = ? WHERE id = ?').run(twoHoursAgo, 'ses_pause');

    const sessions = new Map<string, any>();
    sessions.set('ses_pause', { id: 'ses_pause', containerId: 'c1', status: 'ready' });

    const cm = createStubContainerManager();
    const monitor = new IdleMonitor(store, cm, sessions, {
      idleTimeoutMs: 60 * 60 * 1000,
      destroyAfterMs: 24 * 60 * 60 * 1000,
    });
    monitor.check();

    // Should be paused
    const row = store.get('ses_pause');
    assert.equal(row!.status, 'paused');
    assert.equal(cm.paused.length, 1);
    assert.equal(cm.paused[0], 'c1');
    assert.equal(sessions.get('ses_pause')?.status, 'paused');
  });

  it('should destroy container after extended idle', () => {
    store.create({ id: 'ses_destroy', model: 'm1', containerId: 'c1' });
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
    db.prepare('UPDATE sessions SET last_active_at = ? WHERE id = ?').run(twoDaysAgo, 'ses_destroy');

    const sessions = new Map<string, any>();
    sessions.set('ses_destroy', { id: 'ses_destroy', containerId: 'c1', status: 'ready' });

    const cm = createStubContainerManager();
    const monitor = new IdleMonitor(store, cm, sessions, {
      idleTimeoutMs: 60 * 60 * 1000,
      destroyAfterMs: 24 * 60 * 60 * 1000,
    });
    monitor.check();

    // Should be terminated
    const row = store.get('ses_destroy');
    assert.equal(row!.status, 'terminated');
    assert.equal(cm.destroyed.length, 1);
    assert.equal(sessions.has('ses_destroy'), false);
  });

  it('should skip running sessions', () => {
    store.create({ id: 'ses_running', model: 'm1', containerId: 'c1' });
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    db.prepare('UPDATE sessions SET last_active_at = ? WHERE id = ?').run(twoHoursAgo, 'ses_running');

    const sessions = new Map<string, any>();
    sessions.set('ses_running', { id: 'ses_running', containerId: 'c1', status: 'running' });

    const cm = createStubContainerManager();
    const monitor = new IdleMonitor(store, cm, sessions, {
      idleTimeoutMs: 60 * 60 * 1000,
    });
    monitor.check();

    // Should not be paused — it's running
    assert.equal(cm.paused.length, 0);
  });

  it('should support start and stop', () => {
    const sessions = new Map<string, any>();
    const cm = createStubContainerManager();

    const monitor = new IdleMonitor(store, cm, sessions, {
      checkIntervalMs: 100_000, // Don't actually tick
    });

    monitor.start();
    monitor.start(); // Idempotent
    monitor.stop();
    monitor.stop(); // Idempotent
  });
});
