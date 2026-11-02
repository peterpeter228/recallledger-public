import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, stat, symlink, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const scannerPath = fileURLToPath(new URL('../scripts/secret-scan.mjs', import.meta.url));
const allowlistPath = 'scripts/secret-scan-allowlist.json';
const allowlistBytes = await readFile(new URL('../scripts/secret-scan-allowlist.json', import.meta.url));
const baseAllowlist = JSON.parse(allowlistBytes);
const noreply = baseAllowlist.entries.find(entry => entry.id === 'release-github-noreply');
const startedAt = new Date().toISOString();
const scannerSha256 = createHash('sha256').update(await readFile(scannerPath)).digest('hex');
const allowlistSha256 = createHash('sha256').update(allowlistBytes).digest('hex');
const results = [];
const scans = [];
// Constructed offline, never issued by a provider and never used outside fixtures.
const slashLiteral = ['/', 'SCANNER_FIXTURE_ONLY_', 'B'.repeat(40)].join('');
const providerLiteral = ['sk-', 'SCANNER_FIXTURE_ONLY_', 'A'.repeat(40)].join('');

function syntheticEntry(id, value, rule, paths = ['fixtures/allowed.txt', allowlistPath]) {
  return {
    id, kind: 'synthetic-fixture', value, rule, paths,
    reason: 'Deterministic offline scanner-regression literal constructed by tests/secret-scan.test.mjs; never issued by or sent to a provider.',
  };
}

function syntheticEntries() {
  return [
    syntheticEntry('fixture-slash', slashLiteral, 'assigned-credential-literal'),
    syntheticEntry('fixture-provider-shape', providerLiteral, 'provider-credential-prefix'),
    syntheticEntry('fixture-provider-assignment', providerLiteral, 'assigned-credential-literal'),
  ];
}

async function fixture(files = {}, entries = [], prepare) {
  const temporary = await mkdtemp(join(tmpdir(), 'recallledger-scanner-smoke-'));
  const root = join(temporary, 'repository');
  await mkdir(join(root, 'scripts'), { recursive: true });
  const env = {
    PATH: process.env.PATH ?? '/usr/bin:/bin',
    HOME: temporary, LC_ALL: 'C', TZ: 'UTC',
    GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_TERMINAL_PROMPT: '0', GIT_ALLOW_PROTOCOL: '', GIT_NO_LAZY_FETCH: '1',
    GIT_AUTHOR_NAME: 'RecallLedger', GIT_COMMITTER_NAME: 'RecallLedger',
    GIT_AUTHOR_EMAIL: noreply.value, GIT_COMMITTER_EMAIL: noreply.value,
    GIT_AUTHOR_DATE: '2026-11-02T00:00:00Z', GIT_COMMITTER_DATE: '2026-11-02T00:00:00Z',
  };
  const git = (args, input) => {
    const child = spawnSync('git', ['-c', 'core.hooksPath=/dev/null', ...args], { cwd: root, env, input, encoding: 'utf8', timeout: 10_000 });
    assert.equal(child.status, 0, 'Disposable Git fixture command must succeed; child payload is not printed.');
    return child.stdout.trim();
  };
  const write = async (path, content) => {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), content);
  };
  try {
    const config = { schemaVersion: 1, entries: [...structuredClone(baseAllowlist.entries), ...entries] };
    await write(allowlistPath, JSON.stringify(config, null, 2) + '\n');
    await write('baseline.txt', 'Offline scanner regression fixture.\n');
    for (const [path, content] of Object.entries(files)) await write(path, content);
    git(['init', '--quiet', '--initial-branch=fixture']);
    git(['add', '--', allowlistPath, 'baseline.txt', ...Object.keys(files)]);
    const tree = git(['write-tree']);
    const commit = git(['commit-tree', tree], 'Offline scanner regression fixture\n');
    git(['update-ref', 'refs/heads/fixture', commit]);
    return await prepare({ temporary, root, env, write });
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

async function scan(context, name, extraEnvironment = {}) {
  const jobDir = join(context.temporary, 'reports');
  const child = spawnSync(process.execPath, [scannerPath, '--job-dir', jobDir], {
    cwd: context.root, env: { ...context.env, ...extraEnvironment },
    encoding: 'utf8', timeout: 20_000, maxBuffer: 1024 * 1024,
  });
  assert.equal(child.signal, null, 'Scanner must finish without a timeout or signal.');
  assert.ok([0, 1, 2].includes(child.status), 'Scanner must use its documented exit codes.');
  const json = await readFile(join(jobDir, 'secret-scan.json'), 'utf8');
  const markdown = await readFile(join(context.root, 'submission', 'SECRET_SCAN.md'), 'utf8');
  const report = JSON.parse(json);
  assert.equal(child.status, report.exitCode);
  for (const value of [slashLiteral, providerLiteral]) {
    assert.ok(![json, markdown, child.stdout, child.stderr].some(text => text.includes(value)), 'Reports and terminal output must omit matched values.');
  }
  scans.push({
    name, exitCode: child.status, status: report.status,
    findings: report.findings.length, errors: report.errors.map(error => error.code),
  });
  return report;
}

async function regression(t, name, exercise) {
  await t.test(name, async () => {
    let passed = false;
    try { await exercise(); passed = true; }
    finally { results.push({ name, status: passed ? 'PASS' : 'FAIL' }); }
  });
}

after(async () => {
  if (!process.env.SCANNER_REPAIR_RECORD) return;
  const record = {
    schemaVersion: 1, startedAt, completedAt: new Date().toISOString(),
    command: 'node --test tests/secret-scan.test.mjs',
    scope: 'disposable-local-git-repositories-only',
    nodeVersion: process.version, scannerSha256, allowlistSha256,
    status: results.length > 0 && results.every(result => result.status === 'PASS') ? 'PASS' : 'FAIL',
    cases: results, scans,
    productHistoryScanned: false, productGitRefsModified: false,
    providerCalls: false, deploymentOrUpload: false,
  };
  await mkdir(dirname(process.env.SCANNER_REPAIR_RECORD), { recursive: true });
  await writeFile(process.env.SCANNER_REPAIR_RECORD, JSON.stringify(record, null, 2) + '\n');
});

test('offline secret scanner runtime regressions', async t => {
  await regression(t, 'unquoted slash-prefixed literal is detected in history and worktree', async () => {
    await fixture({ 'fixtures/slash.txt': `api_key=${slashLiteral}\n` }, [], async context => {
      const report = await scan(context, 'slash-prefixed-literal');
      assert.equal(report.exitCode, 1);
      for (const scope of ['history', 'worktree']) {
        assert.ok(report.findings.some(item => item.rule === 'assigned-credential-literal' && item.path === 'fixtures/slash.txt' && item.scope === scope));
      }
    });
  });

  await regression(t, 'tracked ancestor symlink is incomplete and outside content is never read', async () => {
    await fixture({ 'nested/inside.txt': 'Tracked non-secret baseline.\n' }, [], async context => {
      const outside = join(context.temporary, 'outside');
      await mkdir(outside);
      const target = join(outside, 'inside.txt');
      await writeFile(target, `private_key=${slashLiteral}\n`);
      await utimes(target, new Date('2000-01-01T00:00:00Z'), new Date('2026-11-02T00:00:00Z'));
      const before = await stat(target);
      await rm(join(context.root, 'nested'), { recursive: true });
      await symlink(outside, join(context.root, 'nested'), 'dir');
      const report = await scan(context, 'tracked-symlink-ancestor');
      assert.equal(report.exitCode, 2);
      assert.equal(report.status, 'INCOMPLETE');
      assert.equal(report.completeness.worktree, false);
      assert.ok(report.errors.some(item => item.code === 'WORKTREE_SYMLINKED_ANCESTOR_NOT_SCANNED' && item.path === 'nested/inside.txt'));
      assert.ok(!report.findings.some(item => item.rule === 'assigned-credential-literal'));
      assert.equal((await stat(target)).atimeMs, before.atimeMs, 'Outside target access time must remain unchanged.');
    });
  });

  await regression(t, 'exact justified fixture entries and public noreply identity produce clean exit zero', async () => {
    await fixture({ 'fixtures/allowed.txt': `api_key="${providerLiteral}"\nsecret_key=${slashLiteral}\n` }, syntheticEntries(), async context => {
      const report = await scan(context, 'clean-exact-allowlist');
      assert.equal(report.exitCode, 0);
      assert.equal(report.status, 'CLEAN');
      assert.equal(report.completeness.allowlist, true);
      assert.deepEqual(report.findings, []);
      assert.deepEqual(report.errors, []);
      for (const id of ['fixture-slash', 'fixture-provider-shape', 'fixture-provider-assignment', 'release-github-noreply']) {
        assert.ok(report.allowlist.some(entry => entry.id === id && entry.matches > 0));
      }
      assert.ok(report.allowlist.every(entry => !Object.hasOwn(entry, 'value')));
    });
  });

  await regression(t, 'current environment exact match remains a finding despite every shape exception', async () => {
    await fixture({ 'fixtures/allowed.txt': `api_key="${providerLiteral}"\n` }, syntheticEntries(), async context => {
      const report = await scan(context, 'environment-match-unwaivable', { REGRESSION_API_KEY: providerLiteral });
      assert.equal(report.exitCode, 1);
      assert.ok(report.findings.some(item => item.rule === 'current-environment-credential' && item.environmentVariable === 'REGRESSION_API_KEY' && item.path === 'fixtures/allowed.txt'));
      assert.ok(report.findings.some(item => item.rule === 'current-environment-credential' && item.path === allowlistPath));
    });
  });

  await regression(t, 'allowlist exact paths values and rules do not waive adjacent findings', async () => {
    const altered = providerLiteral + 'C';
    const entries = [syntheticEntry('fixture-provider-shape', providerLiteral, 'provider-credential-prefix')];
    await fixture({
      'fixtures/allowed.txt': `api_key="${providerLiteral}"\napi_key="${altered}"\n`,
      'fixtures/unlisted.txt': providerLiteral + '\n',
    }, entries, async context => {
      const report = await scan(context, 'allowlist-exact-scope-only');
      assert.equal(report.exitCode, 1);
      assert.ok(report.findings.some(item => item.rule === 'assigned-credential-literal' && item.path === 'fixtures/allowed.txt' && item.line === 1));
      assert.ok(report.findings.some(item => item.rule === 'provider-credential-prefix' && item.path === 'fixtures/allowed.txt' && item.line === 2));
      assert.ok(report.findings.some(item => item.rule === 'provider-credential-prefix' && item.path === 'fixtures/unlisted.txt'));
    });
  });

  await regression(t, 'allowlist representation is scanned unless its own path is explicitly justified', async () => {
    const entry = syntheticEntry('fixture-provider-shape', providerLiteral, 'provider-credential-prefix', ['fixtures/allowed.txt']);
    await fixture({ 'fixtures/allowed.txt': providerLiteral + '\n' }, [entry], async context => {
      const report = await scan(context, 'allowlist-file-stays-in-scope');
      assert.equal(report.exitCode, 1);
      assert.ok(report.findings.some(item => item.rule === 'provider-credential-prefix' && item.path === allowlistPath));
      assert.ok(!report.findings.some(item => item.path === 'fixtures/allowed.txt'));
    });
  });

  await regression(t, 'public identifier cannot waive an assignment to a private credential field', async () => {
    const value = 'A'.repeat(64);
    const entry = {
      id: 'fixture-public-id', kind: 'public-onchain', value,
      rule: 'assigned-credential-literal', paths: ['fixtures/public.txt'],
      reason: 'Deterministic synthetic public-identifier shape for checking the public-field boundary, not an actual network identifier.',
    };
    await fixture({ 'fixtures/public.txt': `public_key="${value}"\nprivate_key="${value}"\n` }, [entry], async context => {
      const report = await scan(context, 'public-field-boundary');
      assert.equal(report.exitCode, 1);
      assert.ok(!report.findings.some(item => item.rule === 'assigned-credential-literal' && item.path === 'fixtures/public.txt' && item.line === 1));
      assert.ok(report.findings.some(item => item.rule === 'assigned-credential-literal' && item.path === 'fixtures/public.txt' && item.line === 2));
    });
  });

  await regression(t, 'synthetic fixture category cannot waive email PII', async () => {
    const email = ['scanner.fixture', 'example.invalid'].join('@');
    const entry = syntheticEntry('forbidden-email-waiver', email, 'pii-email');
    await fixture({ 'fixtures/allowed.txt': email + '\n' }, [entry], async context => {
      const report = await scan(context, 'pii-waiver-rejected');
      assert.equal(report.exitCode, 2);
      assert.equal(report.completeness.allowlist, false);
      assert.ok(report.errors.some(item => item.code === 'ALLOWLIST_INVALID_OR_UNAVAILABLE'));
      assert.ok(report.findings.some(item => item.rule === 'pii-email' && item.path === 'fixtures/allowed.txt'));
    });
  });

  await regression(t, 'scoped npm lockfile syntax is not email while actual email and other paths remain findings', async () => {
    const scope = ['@', 'gql.tada'].join('');
    const labels = `packages:\n  '${scope}/cli-utils@1.9.4':\n  '${scope}/svelte-support': 1.0.3\n  - '${scope}/vue-support'\n`;
    await fixture({ 'pnpm-lock.yaml': labels }, [], async context => {
      const clean = await scan(context, 'scoped-package-labels-clean');
      assert.equal(clean.exitCode, 0);
      const email = ['scanner.fixture', 'example.invalid'].join('@');
      await context.write('pnpm-lock.yaml', labels + `contact: "${email}"\n`);
      await context.write('notes.txt', labels);
      const findings = await scan(context, 'email-detection-preserved');
      assert.equal(findings.exitCode, 1);
      assert.ok(findings.findings.some(item => item.rule === 'pii-email' && item.path === 'pnpm-lock.yaml' && item.line === 5));
      assert.ok(findings.findings.some(item => item.rule === 'pii-email' && item.path === 'notes.txt'));
    });
  });
});
