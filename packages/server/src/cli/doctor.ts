import chalk from 'chalk';
import Docker from 'dockerode';

interface CheckResult {
  name: string;
  passed: boolean;
  message: string;
  required: boolean;
}

async function check(
  name: string,
  fn: () => Promise<string>,
  required = true,
): Promise<CheckResult> {
  try {
    const message = await fn();
    return { name, passed: true, message, required };
  } catch (err) {
    return {
      name,
      passed: false,
      message: err instanceof Error ? err.message : String(err),
      required,
    };
  }
}

export async function runDoctor() {
  console.log(chalk.bold('\nForge Doctor\n'));

  const results: CheckResult[] = [];

  // Docker
  results.push(
    await check('Docker', async () => {
      const docker = new Docker();
      const version = await docker.version();
      return `v${version.Version}`;
    }),
  );

  // Docker image
  results.push(
    await check('Docker image', async () => {
      const docker = new Docker();
      const images = await docker.listImages({
        filters: { reference: ['forge-sandbox:base'] },
      });
      if (images.length === 0) {
        throw new Error(
          'forge-sandbox:base not found. Run: docker build -t forge-sandbox:base packages/sandbox/',
        );
      }
      const size = images[0]?.Size;
      return `forge-sandbox:base (${Math.round((size ?? 0) / 1024 / 1024)}MB)`;
    }),
  );

  // Ollama
  results.push(
    await check(
      'Ollama',
      async () => {
        const res = await fetch('http://localhost:11434/api/version');
        if (!res.ok) throw new Error('Ollama not reachable');
        const data = (await res.json()) as { version: string };
        return `v${data.version}`;
      },
      false,
    ),
  );

  // Ollama model
  results.push(
    await check(
      'Ollama model',
      async () => {
        const res = await fetch('http://localhost:11434/api/tags');
        if (!res.ok) throw new Error('Cannot list models');
        const data = (await res.json()) as { models: Array<{ name: string }> };
        const hasModel = data.models.some(
          (m) => m.name.includes('qwen2.5-coder') || m.name.includes('qwen2.5-coder:7b'),
        );
        if (!hasModel) {
          throw new Error('qwen2.5-coder:7b not found. Run: ollama pull qwen2.5-coder:7b');
        }
        return 'qwen2.5-coder:7b available';
      },
      false,
    ),
  );

  // Node.js version
  results.push(
    await check('Node.js', async () => {
      const version = process.version;
      const major = parseInt(version.slice(1));
      if (major < 22) throw new Error(`Node.js >= 22 required, found ${version}`);
      return version;
    }),
  );

  // Print results
  let hasFailedRequired = false;
  for (const r of results) {
    const icon = r.passed
      ? chalk.green('PASS')
      : r.required
        ? chalk.red('FAIL')
        : chalk.yellow('WARN');
    const label = r.passed
      ? chalk.white(r.name)
      : r.required
        ? chalk.red(r.name)
        : chalk.yellow(r.name);
    console.log(`  ${icon}  ${label}: ${r.message}`);
    if (!r.passed && r.required) hasFailedRequired = true;
  }

  console.log('');

  if (hasFailedRequired) {
    console.log(chalk.red('Some required checks failed. Fix the issues above and try again.'));
    process.exit(1);
  } else {
    console.log(chalk.green('All required checks passed!'));
  }
}
