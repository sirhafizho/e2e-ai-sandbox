#!/usr/bin/env node

import { Command } from 'commander';
import { runChat } from './chat.js';
import { runDoctor } from './doctor.js';

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

program.parse();
