import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseBlueprint, computeHash, snapshotImageTag, BlueprintSchema } from '../blueprint.js';

describe('BlueprintSchema', () => {
  it('should parse a minimal blueprint (name only)', () => {
    const result = BlueprintSchema.parse({ name: 'test-env' });
    assert.equal(result.name, 'test-env');
    assert.equal(result.base, 'forge-sandbox:base');
    assert.deepEqual(result.repos, []);
    assert.deepEqual(result.setup, []);
    assert.deepEqual(result.tools, []);
    assert.deepEqual(result.env, {});
    assert.deepEqual(result.health_check, []);
    assert.equal(result.resources, undefined);
  });

  it('should parse a full blueprint with all fields', () => {
    const input = {
      name: 'my-project-env',
      base: 'forge-sandbox:latest',
      repos: [
        { url: 'https://github.com/user/repo', path: '/workspace/repo', branch: 'main' },
        { url: 'https://github.com/user/lib', path: '/workspace/lib' },
      ],
      setup: ['cd /workspace/repo && npm install', 'npm run build'],
      tools: ['rust', 'go'],
      env: { NODE_ENV: 'development', DATABASE_URL: 'sqlite:///workspace/data.db' },
      health_check: ['node --version', 'python3 --version'],
      resources: { cpu: 2, memory: '4GB', disk: '10GB' },
    };

    const result = BlueprintSchema.parse(input);
    assert.equal(result.name, 'my-project-env');
    assert.equal(result.base, 'forge-sandbox:latest');
    assert.equal(result.repos.length, 2);
    assert.equal(result.repos[0]!.branch, 'main');
    assert.equal(result.repos[1]!.branch, undefined);
    assert.deepEqual(result.setup, ['cd /workspace/repo && npm install', 'npm run build']);
    assert.deepEqual(result.tools, ['rust', 'go']);
    assert.equal(result.env.NODE_ENV, 'development');
    assert.deepEqual(result.health_check, ['node --version', 'python3 --version']);
    assert.equal(result.resources?.cpu, 2);
    assert.equal(result.resources?.memory, '4GB');
  });

  it('should reject missing name', () => {
    assert.throws(() => BlueprintSchema.parse({}));
  });

  it('should reject empty name', () => {
    assert.throws(() => BlueprintSchema.parse({ name: '' }));
  });

  it('should reject invalid repo URL', () => {
    assert.throws(() =>
      BlueprintSchema.parse({
        name: 'test',
        repos: [{ url: 'not-a-url', path: '/workspace/repo' }],
      }),
    );
  });

  it('should reject repo missing path', () => {
    assert.throws(() =>
      BlueprintSchema.parse({
        name: 'test',
        repos: [{ url: 'https://github.com/user/repo' }],
      }),
    );
  });

  it('should accept cpu as string or number', () => {
    const withNumber = BlueprintSchema.parse({ name: 'test', resources: { cpu: 4 } });
    assert.equal(withNumber.resources?.cpu, 4);

    const withString = BlueprintSchema.parse({ name: 'test', resources: { cpu: '2.5' } });
    assert.equal(withString.resources?.cpu, '2.5');
  });
});

describe('parseBlueprint', () => {
  it('should parse valid YAML and return blueprint + hash', () => {
    const yaml = `
name: test-env
base: forge-sandbox:latest
repos:
  - url: https://github.com/user/repo
    path: /workspace/repo
    branch: main
setup:
  - npm install
env:
  NODE_ENV: development
health_check:
  - node --version
`;
    const result = parseBlueprint(yaml);
    assert.equal(result.blueprint.name, 'test-env');
    assert.equal(result.blueprint.base, 'forge-sandbox:latest');
    assert.equal(result.blueprint.repos.length, 1);
    assert.equal(result.blueprint.repos[0]!.url, 'https://github.com/user/repo');
    assert.equal(typeof result.hash, 'string');
    assert.equal(result.hash.length, 64); // SHA-256 hex
    assert.equal(result.rawYaml, yaml);
  });

  it('should produce consistent hashes for same content', () => {
    const yaml = 'name: test\n';
    const r1 = parseBlueprint(yaml);
    const r2 = parseBlueprint(yaml);
    assert.equal(r1.hash, r2.hash);
  });

  it('should produce different hashes for different content', () => {
    const r1 = parseBlueprint('name: env-a\n');
    const r2 = parseBlueprint('name: env-b\n');
    assert.notEqual(r1.hash, r2.hash);
  });

  it('should throw on empty YAML', () => {
    assert.throws(() => parseBlueprint(''));
  });

  it('should throw on non-object YAML (array)', () => {
    assert.throws(() => parseBlueprint('- just\n- a\n- list\n'));
  });

  it('should throw on YAML with invalid schema', () => {
    assert.throws(() => parseBlueprint('foo: bar\n'));
  });
});

describe('computeHash', () => {
  it('should return a 64-char hex SHA-256', () => {
    const hash = computeHash('hello world');
    assert.equal(hash.length, 64);
    assert.match(hash, /^[a-f0-9]{64}$/);
  });

  it('should be deterministic', () => {
    assert.equal(computeHash('abc'), computeHash('abc'));
  });
});

describe('snapshotImageTag', () => {
  it('should format as forge-snapshot:{name}-{hash12}', () => {
    const hash = 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890';
    const tag = snapshotImageTag('my-project', hash);
    assert.equal(tag, 'forge-snapshot:my-project-abcdef123456');
  });

  it('should sanitize name to lowercase and replace invalid chars', () => {
    const hash = 'a'.repeat(64);
    const tag = snapshotImageTag('My Project!@#', hash);
    assert.equal(tag, 'forge-snapshot:my-project----aaaaaaaaaaaa');
  });

  it('should handle simple names', () => {
    const hash = '0'.repeat(64);
    const tag = snapshotImageTag('test', hash);
    assert.equal(tag, 'forge-snapshot:test-000000000000');
  });
});
