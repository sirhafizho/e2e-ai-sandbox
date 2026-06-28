import chalk from 'chalk';
import { openDatabase, SessionStore } from '../db/index.js';

/**
 * List all persisted sessions.
 */
export function runSessionsList() {
  const db = openDatabase();
  const store = new SessionStore(db);
  const sessions = store.list();

  if (sessions.length === 0) {
    console.log(chalk.dim('No sessions found.'));
    return;
  }

  console.log(chalk.bold(`\n  Sessions (${sessions.length}):\n`));

  const header = `  ${'ID'.padEnd(14)} ${'Status'.padEnd(12)} ${'Model'.padEnd(22)} ${'Created'.padEnd(20)} ${'Last Active'}`;
  console.log(chalk.dim(header));
  console.log(chalk.dim('  ' + '─'.repeat(90)));

  for (const s of sessions) {
    const statusColor =
      s.status === 'ready' ? chalk.green :
      s.status === 'running' ? chalk.yellow :
      s.status === 'terminated' ? chalk.red :
      chalk.dim;

    const created = formatRelativeTime(s.created_at);
    const lastActive = formatRelativeTime(s.last_active_at);
    let historyCount = 0;
    try { const h = JSON.parse(s.history_json); historyCount = Array.isArray(h) ? h.length : 0; } catch { /* */ }

    console.log(
      `  ${chalk.cyan(s.id.padEnd(14))} ${statusColor(s.status.padEnd(12))} ${s.model.padEnd(22)} ${chalk.dim(created.padEnd(20))} ${chalk.dim(lastActive)}${historyCount > 0 ? chalk.dim(` (${historyCount} msgs)`) : ''}`,
    );
  }

  console.log();
}

/**
 * Show details for a specific session.
 */
export function runSessionsShow(id: string) {
  const db = openDatabase();
  const store = new SessionStore(db);
  const session = store.get(id);

  if (!session) {
    console.error(chalk.red(`Session not found: ${id}`));
    process.exit(1);
  }

  let historyCount = 0;
  try { const h = JSON.parse(session.history_json); historyCount = Array.isArray(h) ? h.length : 0; } catch { /* */ }

  console.log(chalk.bold(`\n  Session: ${session.id}\n`));
  console.log(`  Status:       ${session.status}`);
  console.log(`  Model:        ${session.model}`);
  console.log(`  Container:    ${session.container_id ?? chalk.dim('none')}`);
  console.log(`  Created:      ${session.created_at}`);
  console.log(`  Updated:      ${session.updated_at}`);
  console.log(`  Last active:  ${session.last_active_at}`);
  console.log(`  History:      ${historyCount} messages`);
  if (session.context_summary) {
    console.log(`  Summary:      ${chalk.dim(session.context_summary.slice(0, 100) + '...')}`);
  }
  console.log();
}

/**
 * Delete a persisted session.
 */
export function runSessionsDelete(id: string) {
  const db = openDatabase();
  const store = new SessionStore(db);

  const deleted = store.delete(id);
  if (deleted) {
    console.log(chalk.green(`Session ${id} deleted.`));
  } else {
    console.error(chalk.red(`Session not found: ${id}`));
    process.exit(1);
  }
}

/**
 * Format an ISO datetime string as a relative time (e.g., "2m ago", "1h ago").
 */
function formatRelativeTime(isoStr: string): string {
  const now = Date.now();
  const then = new Date(isoStr).getTime();
  const diffMs = now - then;

  if (diffMs < 60_000) return 'just now';
  if (diffMs < 3_600_000) return `${Math.floor(diffMs / 60_000)}m ago`;
  if (diffMs < 86_400_000) return `${Math.floor(diffMs / 3_600_000)}h ago`;
  return `${Math.floor(diffMs / 86_400_000)}d ago`;
}
