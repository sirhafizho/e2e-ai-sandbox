#!/usr/bin/env node

import { Command } from 'commander';
import { runChat } from './chat.js';
import { runDoctor } from './doctor.js';
import { runSessionsList, runSessionsShow, runSessionsDelete } from './sessions.js';
import {
  runSnapshotBuild,
  runSnapshotList,
  runSnapshotPrune,
  runSnapshotInspect,
} from './snapshot.js';

const program = new Command();

program.name('forge').description('Forge — Self-hostable autonomous coding agent').version('0.0.1');

program
  .command('chat [message]')
  .description('Start an interactive chat with the Forge agent')
  .option('-m, --model <model>', 'LLM model to use', 'qwen2.5-coder:7b')
  .option('-p, --provider <provider>', 'LLM provider', 'ollama')
  .action(async (message: string | undefined, options: { model: string; provider: string }) => {
    await runChat(message, options);
  });

program
  .command('doctor')
  .description('Check system requirements')
  .action(async () => {
    await runDoctor();
  });

const sessionsCmd = program
  .command('sessions')
  .description('Manage persisted sessions');

sessionsCmd
  .command('list')
  .description('List all persisted sessions')
  .action(() => {
    runSessionsList();
  });

sessionsCmd
  .command('show <id>')
  .description('Show details for a session')
  .action((id: string) => {
    runSessionsShow(id);
  });

sessionsCmd
  .command('delete <id>')
  .description('Delete a persisted session')
  .action((id: string) => {
    runSessionsDelete(id);
  });

const snapshotCmd = program
  .command('snapshot')
  .description('Manage environment snapshots');

snapshotCmd
  .command('build [path]')
  .description('Build a snapshot from an environment.yaml file')
  .option('--no-cache', 'Force rebuild even if cached')
  .action(async (path: string | undefined, options: { cache: boolean }) => {
    await runSnapshotBuild(path ?? 'environment.yaml', { noCache: !options.cache });
  });

snapshotCmd
  .command('list')
  .description('List all snapshots')
  .action(async () => {
    await runSnapshotList();
  });

snapshotCmd
  .command('prune')
  .description('Remove all snapshots')
  .action(async () => {
    await runSnapshotPrune();
  });

snapshotCmd
  .command('inspect <name>')
  .description('Show snapshot details')
  .action(async (name: string) => {
    await runSnapshotInspect(name);
  });

program.parse();
