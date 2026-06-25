import * as readline from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import chalk from 'chalk';
import ora from 'ora';
import { ContainerManager } from '../sandbox/container-manager.js';
import { ToolRegistry } from '../tools/registry.js';
import { registerBuiltinTools } from '../tools/register-builtins.js';
import { createProvider } from '../llm/provider.js';
import { AgentLoop } from '../agent/agent-loop.js';
import type { LLMProviderConfig } from '@forge/shared';

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
  const agentLoop = new AgentLoop(model, toolRegistry, containerManager);

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

    await processMessage(input);
  }

  rl.close();
}
