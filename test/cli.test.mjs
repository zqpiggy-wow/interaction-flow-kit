import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { cp, mkdir, mkdtemp, readFile, realpath, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const root = resolve(import.meta.dirname, '..');
const cli = join(root, 'bin', 'interaction-flow-kit.mjs');

function run(args, env = {}) {
  return spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8', env: { ...process.env, ...env } });
}

test('help exposes the product and design-tool lifecycle', () => {
  const result = run(['help']);
  assert.equal(result.status, 0);
  for (const command of ['inspect', 'contract', 'install', 'upgrade', 'status', 'doctor', 'validate', 'prompt', 'uninstall']) {
    assert.match(result.stdout, new RegExp(`\\b${command}\\b`));
  }
});

test('inspect returns bounded repository evidence with attributed lines', async () => {
  const sandbox = await mkdtemp(join(tmpdir(), 'ifk-inspect-test-'));
  await mkdir(join(sandbox, 'src'), { recursive: true });
  await writeFile(join(sandbox, 'src', 'export-route.ts'), [
    "router.post('/config/export', authorize('admin'), async () => {",
    "  await queue.enqueue('export-config');",
    "});",
  ].join('\n'));
  await writeFile(join(sandbox, 'src', 'notes.md'), 'export config product notes\n');

  const result = run(['inspect', '--root', sandbox, '--query', 'export config', '--json', '--max-per-category', '2']);
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.repository, await realpath(sandbox));
  assert.ok(report.sections.find((section) => section.id === 'feature-context'));
  assert.ok(report.sections.find((section) => section.id === 'entry-surfaces'));
  assert.ok(report.sections.find((section) => section.id === 'background-work'));
  assert.ok(report.sections.flatMap((section) => section.matches).some((match) => match.lines.some((line) => line.line === 1)));
  assert.ok(report.sections.every((section) => section.matches.length <= 2));
});

test('flow contract initializes, validates graph references, and renders technical artifacts', async () => {
  const sandbox = await mkdtemp(join(tmpdir(), 'ifk-contract-test-'));
  const contractPath = join(sandbox, 'flow.json');
  const initialized = run(['contract', 'init', 'Configuration handoff']);
  assert.equal(initialized.status, 0, initialized.stderr);
  const contract = JSON.parse(initialized.stdout);
  assert.equal(contract.feature, 'Configuration handoff');
  assert.equal('version' in contract, false);
  contract.technical.owners.push({ concern: 'Configuration', owner: 'Settings service', source_of_truth: 'configuration record' });
  contract.technical.data_flows.push({ data: 'Configuration', from: 'Settings service', to: 'Result surface', purpose: 'User handoff', validation: 'schema', failure: 'preserve prior result' });
  await writeFile(contractPath, JSON.stringify(contract));

  const valid = run(['contract', 'validate', contractPath, '--json']);
  assert.equal(valid.status, 0, valid.stderr);
  assert.equal(JSON.parse(valid.stdout).valid, true);

  const rendered = run(['contract', 'render', contractPath]);
  assert.equal(rendered.status, 0, rendered.stderr);
  assert.match(rendered.stdout, /~~~mermaid/);
  assert.match(rendered.stdout, /## Ownership/);
  assert.match(rendered.stdout, /## Data flow/);

  contract.flow.steps[0].next = ['missing'];
  await writeFile(contractPath, JSON.stringify(contract));
  const invalid = run(['contract', 'validate', contractPath, '--json']);
  assert.equal(invalid.status, 1);
  assert.match(JSON.stringify(JSON.parse(invalid.stdout).errors), /unknown-step/);
});

test('cross-stage replay contract distinguishes task identity from selectable result data', async () => {
  const sandbox = await mkdtemp(join(tmpdir(), 'ifk-lineage-test-'));
  const contractPath = join(sandbox, 'replay-flow.json');
  const contract = JSON.parse(run(['contract', 'init', 'Replay to analysis']).stdout);
  contract.flow.steps = [
    {
      id: 'replay',
      actor: 'Analyst',
      action: 'Run historical replay',
      system_effect: 'Persist replay status and result data',
      feedback: 'Show status, metrics, items, warnings, and empty or partial output',
      next: ['analyze'],
      reads: [],
      writes: ['replayTask', 'replayDataset'],
    },
    {
      id: 'analyze',
      actor: 'Analyst',
      action: 'Analyze a compatible replay result',
      system_effect: 'Persist analysis with source provenance',
      feedback: 'Show the selected replay source and analysis',
      next: [],
      reads: ['replayDataset'],
      writes: [],
    },
  ];
  contract.technical.data_objects = [
    {
      id: 'replayTask',
      kind: 'operation',
      identity: 'replay_task_id',
      produced_by: 'replay',
      owner: 'Replay service',
      source_of_truth: 'replay_tasks',
      user_projection: 'Status, phase, failure, and retry history',
      lifecycle: 'Created on submit and terminal after execution',
    },
    {
      id: 'replayDataset',
      kind: 'dataset',
      identity: 'replay_result_id distinct from replay_task_id',
      produced_by: 'replay',
      owner: 'Replay service',
      source_of_truth: 'replay_results and result object storage',
      user_projection: 'Market, time range, strategy, metrics, securities, warnings, and empty state',
      lifecycle: 'Created for completed or partial replay and retained for reuse',
    },
  ];
  contract.technical.data_bindings = [
    {
      from_step: 'replay',
      to_step: 'analyze',
      data_object: 'replayDataset',
      binding: 'select-compatible',
      request_fields: ['source_replay_result_id'],
      response_fields: ['source_replay_summary'],
      selection_query: 'List completed visible replay results, newest first',
      compatibility: ['tenant', 'market', 'strategy_hash', 'data_version'],
      provenance: 'Persist result ID and show replay summary in analysis',
      correction: 'Change source before submit or start an independent analysis mode',
      staleness: 'Keep historical provenance and mark analysis stale if mutable inputs are superseded',
      empty_behavior: 'Explain why no result is compatible and link to create a replay without losing analysis inputs',
    },
  ];
  await writeFile(contractPath, JSON.stringify(contract));

  const valid = run(['contract', 'validate', contractPath, '--json']);
  assert.equal(valid.status, 0, valid.stderr || valid.stdout);
  assert.equal(JSON.parse(valid.stdout).valid, true);

  const rendered = run(['contract', 'render', contractPath]);
  assert.equal(rendered.status, 0, rendered.stderr);
  assert.match(rendered.stdout, /## Data objects/);
  assert.match(rendered.stdout, /\| Reads \| Writes \|/);
  assert.match(rendered.stdout, /replay_task_id/);
  assert.match(rendered.stdout, /replay_result_id distinct from replay_task_id/);
  assert.match(rendered.stdout, /## Stage data lineage/);
  assert.match(rendered.stdout, /select-compatible/);
  assert.match(rendered.stdout, /source_replay_result_id/);
});

test('lineage validation rejects implicit or unusable cross-stage handoffs', async () => {
  const sandbox = await mkdtemp(join(tmpdir(), 'ifk-lineage-invalid-test-'));
  const contractPath = join(sandbox, 'invalid-lineage.json');
  const contract = JSON.parse(run(['contract', 'init', 'Broken pipeline']).stdout);
  contract.flow.steps = [
    { id: 'produce', action: 'Produce data', next: ['consume'], reads: [], writes: ['result'] },
    { id: 'consume', action: 'Consume data', next: [], reads: ['result'], writes: [] },
  ];
  contract.technical.data_objects = [
    { id: 'result', kind: 'dataset', identity: 'result_id', produced_by: 'produce', owner: 'Service', source_of_truth: 'results' },
  ];
  await writeFile(contractPath, JSON.stringify(contract));

  const unbound = run(['contract', 'validate', contractPath, '--json']);
  assert.equal(unbound.status, 1);
  assert.match(JSON.stringify(JSON.parse(unbound.stdout).errors), /missing-data-binding/);

  contract.technical.data_bindings = [{
    from_step: 'produce',
    to_step: 'consume',
    data_object: 'result',
    binding: 'select-compatible',
    request_fields: ['source_result_id'],
  }];
  await writeFile(contractPath, JSON.stringify(contract));
  const incompleteSelection = run(['contract', 'validate', contractPath, '--json']);
  assert.equal(incompleteSelection.status, 1);
  const selectionCodes = JSON.parse(incompleteSelection.stdout).errors.map((error) => error.code);
  for (const code of ['uninspectable-selection', 'missing-selection-query', 'missing-compatibility', 'missing-empty-behavior']) assert.ok(selectionCodes.includes(code), code);

  contract.technical.data_objects[0].user_projection = 'Summary that distinguishes results';
  contract.technical.data_bindings[0] = {
    from_step: 'produce',
    to_step: 'consume',
    data_object: 'result',
    binding: 'inherit-current',
    request_fields: ['source_result_id'],
  };
  await writeFile(contractPath, JSON.stringify(contract));
  const incompleteInheritance = run(['contract', 'validate', contractPath, '--json']);
  assert.equal(incompleteInheritance.status, 1);
  const inheritanceCodes = JSON.parse(incompleteInheritance.stdout).errors.map((error) => error.code);
  assert.ok(inheritanceCodes.includes('missing-provenance'));
  assert.ok(inheritanceCodes.includes('missing-correction'));
});

test('validate accepts the bundled skill', () => {
  const result = run(['validate', root, '--json']);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).valid, true);
});

test('validate reports a broken routed reference', async () => {
  const sandbox = await mkdtemp(join(tmpdir(), 'ifk-validate-test-'));
  await cp(join(root, 'SKILL.md'), join(sandbox, 'SKILL.md'));
  await cp(join(root, 'agents'), join(sandbox, 'agents'), { recursive: true });
  await cp(join(root, 'references'), join(sandbox, 'references'), { recursive: true });
  await cp(join(root, 'schemas'), join(sandbox, 'schemas'), { recursive: true });
  await cp(join(root, 'scripts'), join(sandbox, 'scripts'), { recursive: true });
  await writeFile(join(sandbox, 'SKILL.md'), (await readFile(join(sandbox, 'SKILL.md'), 'utf8')).replace('(references/review.md)', '(references/missing.md)'));

  const result = run(['validate', sandbox, '--json']);
  assert.equal(result.status, 1);
  assert.deepEqual(JSON.parse(result.stdout).errors, ['Broken reference: references/missing.md']);
});

test('validate reports broken links inside routed references', async () => {
  const sandbox = await mkdtemp(join(tmpdir(), 'ifk-nested-link-test-'));
  await cp(join(root, 'SKILL.md'), join(sandbox, 'SKILL.md'));
  await cp(join(root, 'agents'), join(sandbox, 'agents'), { recursive: true });
  await cp(join(root, 'references'), join(sandbox, 'references'), { recursive: true });
  await cp(join(root, 'schemas'), join(sandbox, 'schemas'), { recursive: true });
  await cp(join(root, 'scripts'), join(sandbox, 'scripts'), { recursive: true });
  const workflow = join(sandbox, 'references', 'agent-workflow.md');
  await writeFile(workflow, (await readFile(workflow, 'utf8')).replace('(technical-design.md)', '(missing-design.md)'));

  const result = run(['validate', sandbox, '--json']);
  assert.equal(result.status, 1);
  assert.match(JSON.parse(result.stdout).errors.join('\n'), /Broken link in references\/agent-workflow.md: missing-design.md/);
});

test('install, status, upgrade, and recoverable uninstall form a closed loop', async () => {
  const sandbox = await mkdtemp(join(tmpdir(), 'ifk-cli-test-'));
  const skillsDir = join(sandbox, 'skills');

  const installed = run(['install', '--dest', skillsDir, '--json']);
  assert.equal(installed.status, 0, installed.stderr);
  assert.equal(JSON.parse(installed.stdout).results[0].action, 'installed');

  const status = run(['status', '--dest', skillsDir, '--json']);
  assert.equal(status.status, 0, status.stderr);
  assert.equal(JSON.parse(status.stdout).results[0].current, true);

  const skillFile = join(skillsDir, 'interaction-flow-kit', 'SKILL.md');
  assert.equal(existsSync(join(skillsDir, 'interaction-flow-kit', 'scripts', 'flow-contract.mjs')), true);
  assert.equal(existsSync(join(skillsDir, 'interaction-flow-kit', 'schemas', 'flow-contract.schema.json')), true);
  const installedScript = spawnSync(process.execPath, [join(skillsDir, 'interaction-flow-kit', 'scripts', 'flow-contract.mjs'), 'init', 'Installed flow'], { encoding: 'utf8' });
  assert.equal(installedScript.status, 0, installedScript.stderr);
  assert.equal(JSON.parse(installedScript.stdout).feature, 'Installed flow');
  await writeFile(skillFile, `${await readFile(skillFile, 'utf8')}\nlocal edit\n`);

  const stale = run(['status', '--dest', skillsDir, '--json']);
  assert.equal(stale.status, 1);
  assert.equal(JSON.parse(stale.stdout).results[0].current, false);

  const upgraded = run(['upgrade', '--dest', skillsDir, '--json']);
  assert.equal(upgraded.status, 0, upgraded.stderr);
  assert.equal(JSON.parse(upgraded.stdout).results[0].action, 'updated');
  assert.ok(JSON.parse(upgraded.stdout).results[0].backupDir);

  const removed = run(['uninstall', '--dest', skillsDir, '--yes', '--json']);
  assert.equal(removed.status, 0, removed.stderr);
  const removal = JSON.parse(removed.stdout);
  assert.equal(removal.action, 'removed');
  assert.equal(removal.results[0].recoverable, true);
});

test('prompt provides compact agent entry points', () => {
  const result = run(['prompt', 'spec']);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /\$interaction-flow-kit/);
  assert.match(result.stdout, /job behind the request/);
  assert.match(result.stdout, /unnecessary artifacts/);

  const prd = run(['prompt', 'prd']);
  assert.equal(prd.status, 0);
  assert.match(prd.stdout, /Technical Design Contract/);
  assert.match(prd.stdout, /downstream outcome/);
  assert.match(prd.stdout, /product promises/);

  const review = run(['prompt', 'review']);
  assert.equal(review.status, 0);
  assert.match(review.stdout, /intent trigger through downstream use/);
});

test('install protects an unmanaged skill and force preserves a backup', async () => {
  const sandbox = await mkdtemp(join(tmpdir(), 'ifk-unmanaged-test-'));
  const skillsDir = join(sandbox, 'skills');
  const unmanagedDir = join(skillsDir, 'interaction-flow-kit');
  await mkdir(unmanagedDir, { recursive: true });
  await writeFile(join(unmanagedDir, 'SKILL.md'), 'user-owned content\n');

  const refused = run(['install', '--dest', skillsDir, '--json']);
  assert.equal(refused.status, 1);
  assert.match(refused.stderr, /unmanaged skill/);
  assert.equal(await readFile(join(unmanagedDir, 'SKILL.md'), 'utf8'), 'user-owned content\n');

  const forced = run(['install', '--dest', skillsDir, '--force', '--json']);
  assert.equal(forced.status, 0, forced.stderr);
  const result = JSON.parse(forced.stdout).results[0];
  assert.equal(result.action, 'updated');
  assert.ok(result.backupDir);
  assert.equal(await readFile(join(result.backupDir, 'SKILL.md'), 'utf8'), 'user-owned content\n');
});

test('doctor gives an executable next step before installation', async () => {
  const sandbox = await mkdtemp(join(tmpdir(), 'ifk-doctor-test-'));
  const destination = join(sandbox, 'skills');
  const result = run(['doctor', '--dest', destination, '--json']);
  assert.equal(result.status, 1);
  const report = JSON.parse(result.stdout);
  assert.equal(report.next, `interaction-flow-kit install --dest ${join(sandbox, 'skills')}`);
  assert.equal(report.results[0].checks.find((check) => check.name === 'bundled-skill').ok, true);
  assert.equal(existsSync(destination), false, 'doctor must not create an installation directory');
});

test('target registry resolves project and global paths', async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), 'ifk-targets-project-'));
  const fakeHome = await mkdtemp(join(tmpdir(), 'ifk-targets-home-'));
  const env = { HOME: fakeHome, CODEX_HOME: join(fakeHome, 'custom-codex'), XDG_CONFIG_HOME: join(fakeHome, 'xdg') };

  const project = run(['targets', '--target', 'all', '--scope', 'project', '--project-root', projectRoot, '--json'], env);
  assert.equal(project.status, 0, project.stderr);
  const projectTargets = JSON.parse(project.stdout).results;
  assert.equal(projectTargets.length, 5, 'agents and codex share .agents at project scope');
  assert.deepEqual(projectTargets.map((target) => target.skillDir).sort(), [
    join(projectRoot, '.agents', 'skills', 'interaction-flow-kit'),
    join(projectRoot, '.claude', 'skills', 'interaction-flow-kit'),
    join(projectRoot, '.opencode', 'skills', 'interaction-flow-kit'),
    join(projectRoot, '.trae', 'skills', 'interaction-flow-kit'),
    join(projectRoot, '.traecli', 'skills', 'interaction-flow-kit'),
  ].sort());

  const global = run(['targets', '--target', 'all', '--scope', 'global', '--json'], env);
  assert.equal(global.status, 0, global.stderr);
  assert.deepEqual(JSON.parse(global.stdout).results.map((target) => target.skillDir).sort(), [
    join(fakeHome, '.agents', 'skills', 'interaction-flow-kit'),
    join(fakeHome, 'custom-codex', 'skills', 'interaction-flow-kit'),
    join(fakeHome, '.claude', 'skills', 'interaction-flow-kit'),
    join(fakeHome, '.trae', 'skills', 'interaction-flow-kit'),
    join(fakeHome, '.traecli', 'skills', 'interaction-flow-kit'),
    join(fakeHome, 'xdg', 'opencode', 'skills', 'interaction-flow-kit'),
  ].sort());
});

test('default install is project-local .agents and all installs every deduplicated target', async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), 'ifk-project-install-'));
  const defaultInstall = run(['install', '--project-root', projectRoot, '--json']);
  assert.equal(defaultInstall.status, 0, defaultInstall.stderr);
  assert.equal(JSON.parse(defaultInstall.stdout).results[0].skillDir, join(projectRoot, '.agents', 'skills', 'interaction-flow-kit'));

  const allRoot = await mkdtemp(join(tmpdir(), 'ifk-all-install-'));
  const allInstall = run(['install', '--target', 'all', '--scope', 'project', '--project-root', allRoot, '--json']);
  assert.equal(allInstall.status, 0, allInstall.stderr);
  assert.equal(JSON.parse(allInstall.stdout).results.length, 5);
  for (const folder of ['.agents', '.claude', '.opencode', '.trae', '.traecli']) {
    assert.equal(existsSync(join(allRoot, folder, 'skills', 'interaction-flow-kit', 'SKILL.md')), true);
    assert.equal(existsSync(join(allRoot, folder, 'skills', 'interaction-flow-kit', 'references', 'technical-design.md')), true);
  }
});

test('multi-target conflict aborts before writing any selected target', async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), 'ifk-atomic-preflight-'));
  const claudeSkill = join(projectRoot, '.claude', 'skills', 'interaction-flow-kit');
  await mkdir(claudeSkill, { recursive: true });
  await writeFile(join(claudeSkill, 'SKILL.md'), 'unmanaged\n');

  const result = run(['install', '--target', 'agents,claude', '--scope', 'project', '--project-root', projectRoot, '--json']);
  assert.equal(result.status, 1);
  assert.equal(existsSync(join(projectRoot, '.agents', 'skills', 'interaction-flow-kit')), false);
  assert.equal(await readFile(join(claudeSkill, 'SKILL.md'), 'utf8'), 'unmanaged\n');
});

test('project scope discovers the nearest git root and custom dest stays exclusive', async () => {
  const projectRoot = await mkdtemp(join(tmpdir(), 'ifk-git-root-'));
  await mkdir(join(projectRoot, '.git'));
  const nested = join(projectRoot, 'packages', 'app');
  await mkdir(nested, { recursive: true });
  const discovered = spawnSync(process.execPath, [cli, 'targets', '--json'], { encoding: 'utf8', cwd: nested, env: process.env });
  assert.equal(discovered.status, 0, discovered.stderr);
  assert.equal(JSON.parse(discovered.stdout).results[0].skillDir, join(await realpath(projectRoot), '.agents', 'skills', 'interaction-flow-kit'));

  const invalid = run(['install', '--dest', join(projectRoot, 'custom'), '--target', 'agents']);
  assert.equal(invalid.status, 2);
  assert.match(invalid.stderr, /cannot be combined/);
});
