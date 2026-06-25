import * as readline from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import chalk from 'chalk';
import ora from 'ora';
import { ContainerManager } from '../sandbox/container-manager.js';
import { ToolRegistry } from '../tools/registry.js';
import { registerBuiltinTools } from '../tools/register-builtins.js';
import { createProvider } from '../llm/provider.js';
import { AgentLoop } from '../agent/agent-loop.js';
import { TokenBudget } from '../agent/token-budget.js';
import type { LLMProviderConfig } from '@forge/shared';
import type { TokenBudgetData, ContextWindowedData } from '../agent/types.js';

interface ChatOptions {
  model: string;
  provider: string;
}

export async function runChat(initialMessage: string | undefined, options: ChatOptions) {
  const containerManager = new ContainerManager();
  const toolRegistry = new ToolRegistry();
  registerBuiltinTools(toolRegistry);

  const sessionId = `ses_${crypto.randomUUID().slice(0, 8)}`;
  console.log(chalk.dim(`Session: ${sessionId}`));

  // Create container
  const spinner = ora('Starting sandbox container...').start();
  let containerId: string;

  try {
    const info = await containerManager.create({ sessionId });
    containerId = info.containerId;
    spinner.succeed('Sandbox ready');
  } catch (err) {
    spinner.fail('Failed to start sandbox');
    console.error(chalk.red(err instanceof Error ? err.message : String(err)));
    process.exit(1);
  }

  // Set up LLM provider
  const providerConfig: LLMProviderConfig = {
    type: options.provider as LLMProviderConfig['type'],
    model: options.model,
  };

  const model = createProvider(providerConfig);
  const agentLoop = new AgentLoop(model, toolRegistry, containerManager, {
    tokenBudget: TokenBudget.forModel(options.model),
  });

  const sessionContext = {
    sessionId,
    containerId,
    model: options.model,
  };

  // Process a single message
  async function processMessage(content: string) {
    process.stdout.write('\n');

    for await (const event of agentLoop.run(content, sessionContext)) {
      switch (event.type) {
        case 'agent_message': {
          const data = event.data as { content: string; done: boolean };
          if (data.content) {
            process.stdout.write(data.content);
          }
          break;
        }
        case 'tool_start': {
          const data = event.data as { toolName: string; inputSummary: string };
          process.stdout.write(
            chalk.dim(`\n  [${chalk.cyan(data.toolName)}] ${data.inputSummary.slice(0, 80)}\n`),
          );
          break;
        }
        case 'tool_complete': {
          const data = event.data as { output: unknown; isError: boolean };
          if (data.isError) {
            process.stdout.write(chalk.red('  Error: '));
          } else {
            process.stdout.write(chalk.green('  Done\n'));
          }
          break;
        }
        case 'tool_error': {
          const data = event.data as { error: string };
          process.stdout.write(chalk.red(`  Error: ${data.error}\n`));
          break;
        }
        case 'token_budget': {
          const data = event.data as TokenBudgetData;
          if (data.level !== 'normal') {
            const color = data.level === 'emergency' ? chalk.red : data.level === 'critical' ? chalk.yellow : chalk.dim;
            process.stdout.write(
              color(`\n  [budget] ${data.level}: ${Math.round(data.usageRatio * 100)}% used (${data.used}/${data.usableBudget} tokens)\n`),
            );
          }
          break;
        }
        case 'context_windowed': {
          const data = event.data as ContextWindowedData;
          process.stdout.write(
            chalk.cyan(`\n  [windowing] Evicted ${data.evictedMessages} messages, freed ~${data.tokensFreed} tokens (now ${data.newLevel})\n`),
          );
          break;
        }
        case 'done': {
          process.stdout.write('\n');
          break;
        }
      }
    }
  }

  // Handle initial message or interactive mode
  if (initialMessage) {
    await processMessage(initialMessage);
  }

  // Interactive prompt
  const rl = readline.createInterface({ input: stdin, output: stdout });

  let ctrlCCount = 0;

  const cleanup = async () => {
    console.log(chalk.dim('\nCleaning up...'));
    await containerManager.destroy(containerId).catch(() => {});
    process.exit(0);
  };

  process.on('SIGINT', () => {
    ctrlCCount++;
    if (ctrlCCount >= 2) {
      void cleanup();
    } else {
      console.log(chalk.dim('\n(Press Ctrl+C again to exit)'));
    }
  });

  while (true) {
    ctrlCCount = 0;
    const input = await rl.question(chalk.bold('> ')).catch(() => null);
    if (input === null) break;
    if (input.trim() === '') continue;
    if (input.trim() === '/exit' || input.trim() === '/quit') break;

    if (input.trim() === '/history') {
      const history = agentLoop.getHistory();
      console.log(chalk.dim(`\nConversation history (${history.length} messages):`));
      for (const entry of history.getSummary()) {
        console.log(chalk.dim(`  [${entry.role}] ${entry.preview}`));
      }
      console.log();
      continue;
    }

    if (input.trim() === '/clear') {
      agentLoop.getHistory().clear();
      console.log(chalk.dim('\nConversation history cleared.\n'));
      continue;
    }

    if (input.trim() === '/budget') {
      const budget = agentLoop.getTokenBudget();
      if (!budget) {
        console.log(chalk.dim('\nNo token budget configured.\n'));
      } else {
        const status = budget.getStatus();
        const levelColor = status.level === 'normal' ? chalk.green : status.level === 'warning' ? chalk.yellow : chalk.red;
        console.log(chalk.dim(`\nToken Budget:`));
        console.log(chalk.dim(`  Context window: ${status.contextWindow.toLocaleString()} tokens`));
        console.log(chalk.dim(`  Usable budget:  ${status.usableBudget.toLocaleString()} tokens`));
        console.log(chalk.dim(`  Used:           ${status.used.toLocaleString()} tokens (${Math.round(status.usageRatio * 100)}%)`));
        console.log(chalk.dim(`  Remaining:      ${status.remaining.toLocaleString()} tokens`));
        console.log(levelColor(`  Level:          ${status.level}`));
        const history = agentLoop.getHistory();
        if (history.hasSummary) {
          console.log(chalk.dim(`  Context summary: active`));
        }
        console.log();
      }
      continue;
    }

    await processMessage(input);
  }

  rl.close();
}
