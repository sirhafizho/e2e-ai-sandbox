import chalk from 'chalk';
import ora from 'ora';
import { loadBlueprint } from '../snapshot/blueprint.js';
import { SnapshotBuilder } from '../snapshot/snapshot-builder.js';

/**
 * Build a snapshot from an environment.yaml file.
 */
export async function runSnapshotBuild(yamlPath: string, options: { noCache?: boolean }) {
  const spinner = ora('Loading blueprint...').start();

  let parsed;
  try {
    parsed = await loadBlueprint(yamlPath);
  } catch (err) {
    spinner.fail(`Failed to load blueprint: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }

  spinner.succeed(`Blueprint loaded: ${chalk.cyan(parsed.blueprint.name)}`);
  console.log(chalk.dim(`  Base image: ${parsed.blueprint.base}`));
  console.log(chalk.dim(`  Hash: ${parsed.hash.slice(0, 12)}...`));

  if (parsed.blueprint.repos.length > 0) {
    console.log(chalk.dim(`  Repos: ${parsed.blueprint.repos.map((r) => r.url).join(', ')}`));
  }
  if (parsed.blueprint.setup.length > 0) {
    console.log(chalk.dim(`  Setup commands: ${parsed.blueprint.setup.length}`));
  }
  if (parsed.blueprint.tools.length > 0) {
    console.log(chalk.dim(`  Tools: ${parsed.blueprint.tools.join(', ')}`));
  }
  console.log();

  const builder = new SnapshotBuilder();
  const buildSpinner = ora('Building snapshot...').start();

  try {
    const result = await builder.build(parsed, {
      noCache: options.noCache,
      onProgress: (progress) => {
        buildSpinner.text = `[${progress.index + 1}/${progress.total}] ${progress.step}: ${progress.detail}`;
      },
    });

    if (result.cached) {
      buildSpinner.succeed(`Using cached snapshot: ${chalk.cyan(result.imageTag)}`);
      return;
    }

    const failedSteps = result.steps.filter((s) => !s.success);
    if (failedSteps.length > 0) {
      buildSpinner.fail('Snapshot build failed');
      for (const step of failedSteps) {
        console.error(chalk.red(`  Step "${step.step}" failed: ${step.error}`));
      }
      process.exit(1);
    }

    buildSpinner.succeed(
      `Snapshot built: ${chalk.cyan(result.imageTag)} ${chalk.dim(`(${formatDuration(result.durationMs)})`)}`,
    );

    // Show step summary
    for (const step of result.steps) {
      const icon = step.success ? chalk.green('\u2713') : chalk.red('\u2717');
      console.log(`  ${icon} ${step.step} ${chalk.dim(`(${formatDuration(step.durationMs)})`)}`);
    }
    console.log();
  } catch (err) {
    buildSpinner.fail(`Build error: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}

/**
 * List all snapshots.
 */
export async function runSnapshotList() {
  const builder = new SnapshotBuilder();

  try {
    const snapshots = await builder.listSnapshots();

    if (snapshots.length === 0) {
      console.log(chalk.dim('No snapshots found.'));
      return;
    }

    console.log(chalk.bold(`\n  Snapshots (${snapshots.length}):\n`));

    const header = `  ${'Tag'.padEnd(45)} ${'Size'.padEnd(12)} ${'Created'}`;
    console.log(chalk.dim(header));
    console.log(chalk.dim('  ' + '\u2500'.repeat(75)));

    for (const snap of snapshots) {
      const size = formatSize(snap.size);
      const created = formatRelativeTime(snap.created);
      console.log(
        `  ${chalk.cyan(snap.tag.padEnd(45))} ${size.padEnd(12)} ${chalk.dim(created)}`,
      );
    }

    console.log();
  } catch (err) {
    console.error(chalk.red(`Failed to list snapshots: ${err instanceof Error ? err.message : String(err)}`));
    process.exit(1);
  }
}

/**
 * Remove old/unused snapshots.
 */
export async function runSnapshotPrune() {
  const builder = new SnapshotBuilder();

  try {
    const snapshots = await builder.listSnapshots();

    if (snapshots.length === 0) {
      console.log(chalk.dim('No snapshots to prune.'));
      return;
    }

    console.log(chalk.bold(`\n  Pruning ${snapshots.length} snapshot(s)...\n`));

    let removed = 0;
    for (const snap of snapshots) {
      try {
        await builder.removeSnapshot(snap.tag);
        console.log(`  ${chalk.red('\u2717')} Removed: ${snap.tag}`);
        removed++;
      } catch (err) {
        console.log(
          `  ${chalk.yellow('!')} Skipped: ${snap.tag} (${err instanceof Error ? err.message : 'in use'})`,
        );
      }
    }

    console.log(chalk.dim(`\n  Removed ${removed} snapshot(s), ${snapshots.length - removed} skipped.\n`));
  } catch (err) {
    console.error(chalk.red(`Failed to prune snapshots: ${err instanceof Error ? err.message : String(err)}`));
    process.exit(1);
  }
}

/**
 * Show details for a specific snapshot.
 */
export async function runSnapshotInspect(nameOrTag: string) {
  const builder = new SnapshotBuilder();

  // If user passes just a name, try to find a matching tag
  let imageTag = nameOrTag;
  if (!nameOrTag.includes(':')) {
    const snapshots = await builder.listSnapshots();
    const match = snapshots.find((s) => s.tag.includes(nameOrTag));
    if (match) {
      imageTag = match.tag;
    } else {
      console.error(chalk.red(`No snapshot found matching: ${nameOrTag}`));
      process.exit(1);
    }
  }

  try {
    const detail = await builder.inspectSnapshot(imageTag);

    console.log(chalk.bold(`\n  Snapshot: ${detail.tag}\n`));
    console.log(`  Image ID:    ${detail.imageId.slice(0, 19)}...`);
    console.log(`  Size:        ${formatSize(detail.size)}`);
    console.log(`  Created:     ${detail.created}`);
    console.log(`  Layers:      ${detail.layers.length}`);

    if (detail.envVars.length > 0) {
      console.log(`  Env vars:    ${detail.envVars.length}`);
      for (const env of detail.envVars.slice(0, 10)) {
        const [key] = env.split('=');
        console.log(chalk.dim(`    ${key}=...`));
      }
      if (detail.envVars.length > 10) {
        console.log(chalk.dim(`    ... and ${detail.envVars.length - 10} more`));
      }
    }

    if (Object.keys(detail.labels).length > 0) {
      console.log(`  Labels:`);
      for (const [k, v] of Object.entries(detail.labels)) {
        console.log(chalk.dim(`    ${k}: ${v}`));
      }
    }

    console.log();
  } catch (err) {
    console.error(chalk.red(`Failed to inspect snapshot: ${err instanceof Error ? err.message : String(err)}`));
    process.exit(1);
  }
}

// --- Helpers ---

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60_000)}m ${Math.floor((ms % 60_000) / 1000)}s`;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)}GB`;
}

function formatRelativeTime(isoStr: string): string {
  const now = Date.now();
  const then = new Date(isoStr).getTime();
  const diffMs = now - then;

  if (diffMs < 60_000) return 'just now';
  if (diffMs < 3_600_000) return `${Math.floor(diffMs / 60_000)}m ago`;
  if (diffMs < 86_400_000) return `${Math.floor(diffMs / 3_600_000)}h ago`;
  return `${Math.floor(diffMs / 86_400_000)}d ago`;
}
