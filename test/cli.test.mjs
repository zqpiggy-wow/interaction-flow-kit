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
  await writeFile(join(sandbox, 'src', 'legacy-export-worker.ts'), [
    "if (featureFlag('legacy-export')) {",
    "  await legacyExportWorker.retry();",
    "}",
  ].join('\n'));

  const result = run(['inspect', '--root', sandbox, '--query', 'export config', '--json', '--max-per-category', '2']);
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.repository, await realpath(sandbox));
  assert.ok(report.sections.find((section) => section.id === 'feature-context'));
  assert.ok(report.sections.find((section) => section.id === 'entry-surfaces'));
  assert.ok(report.sections.find((section) => section.id === 'background-work'));
  assert.ok(report.sections.find((section) => section.id === 'implementation-paths'));
  const implementationPaths = report.sections.find((section) => section.id === 'implementation-paths');
  assert.ok(implementationPaths.matches.some((match) => match.file.endsWith('legacy-export-worker.ts')));
  assert.ok(implementationPaths.matches.some((match) => match.lines.some((line) => line.text.includes('legacyExportWorker.retry'))));
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
      data_boundary: 'replay_flow',
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
      data_boundary: 'analysis_flow',
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
    { id: 'produce', data_boundary: 'producer_flow', action: 'Produce data', next: ['consume'], reads: [], writes: ['result'] },
    { id: 'consume', data_boundary: 'consumer_flow', action: 'Consume data', next: [], reads: ['result'], writes: [] },
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

test('data boundaries reject missing ownership and cross-boundary writes', async () => {
  const sandbox = await mkdtemp(join(tmpdir(), 'ifk-boundary-write-test-'));
  const contractPath = join(sandbox, 'boundary-write.json');
  const contract = JSON.parse(run(['contract', 'init', 'Boundary ownership']).stdout);
  contract.flow.steps = [
    { id: 'produce', data_boundary: 'catalog_flow', action: 'Produce catalog result', next: ['consume'], reads: [], writes: ['catalogResult'] },
    { id: 'consume', action: 'Patch catalog result from pricing', next: [], reads: [], writes: ['catalogResult'] },
  ];
  contract.technical.data_objects = [{
    id: 'catalogResult',
    kind: 'dataset',
    identity: 'catalog_result_id',
    produced_by: 'produce',
    owner: 'Catalog module',
    source_of_truth: 'catalog_results',
    user_projection: 'Catalog result summary',
  }];
  await writeFile(contractPath, JSON.stringify(contract));

  const missingBoundary = run(['contract', 'validate', contractPath, '--json']);
  assert.equal(missingBoundary.status, 1);
  assert.ok(JSON.parse(missingBoundary.stdout).errors.some((error) => error.code === 'missing-data-boundary'));

  contract.flow.steps[1].data_boundary = 'pricing_flow';
  await writeFile(contractPath, JSON.stringify(contract));
  const foreignWrite = run(['contract', 'validate', contractPath, '--json']);
  assert.equal(foreignWrite.status, 1);
  assert.ok(JSON.parse(foreignWrite.stdout).errors.some((error) => error.code === 'cross-boundary-write'));
});

test('data boundaries cannot write objects owned by external systems', async () => {
  const sandbox = await mkdtemp(join(tmpdir(), 'ifk-external-write-test-'));
  const contractPath = join(sandbox, 'external-write.json');
  const contract = JSON.parse(run(['contract', 'init', 'External ownership']).stdout);
  contract.flow.steps = [{
    id: 'sync',
    data_boundary: 'local_sync',
    action: 'Update external customer state directly',
    next: [],
    reads: [],
    writes: ['externalCustomer'],
  }];
  contract.technical.data_objects = [{
    id: 'externalCustomer',
    kind: 'record',
    identity: 'external_customer_id',
    external_source: 'CRM customer service',
    owner: 'CRM',
    source_of_truth: 'CRM customers API',
    internal_purpose: 'Reference the external customer in the local flow',
  }];
  await writeFile(contractPath, JSON.stringify(contract));

  const result = run(['contract', 'validate', contractPath, '--json']);
  assert.equal(result.status, 1);
  assert.ok(JSON.parse(result.stdout).errors.some((error) => error.code === 'external-data-write'));
});

test('data boundaries reject reciprocal module dependencies', async () => {
  const sandbox = await mkdtemp(join(tmpdir(), 'ifk-boundary-cycle-test-'));
  const contractPath = join(sandbox, 'boundary-cycle.json');
  const contract = JSON.parse(run(['contract', 'init', 'Coupled modules']).stdout);
  contract.flow.steps = [
    { id: 'moduleA', data_boundary: 'module_a', action: 'Produce A result from B result', next: ['moduleB'], reads: ['resultB'], writes: ['resultA'] },
    { id: 'moduleB', data_boundary: 'module_b', action: 'Produce B result from A result', next: [], reads: ['resultA'], writes: ['resultB'] },
  ];
  contract.technical.data_objects = [
    { id: 'resultA', kind: 'dataset', identity: 'result_a_id', produced_by: 'moduleA', owner: 'Module A', source_of_truth: 'module_a_results', user_projection: 'A result summary' },
    { id: 'resultB', kind: 'dataset', identity: 'result_b_id', produced_by: 'moduleB', owner: 'Module B', source_of_truth: 'module_b_results', user_projection: 'B result summary' },
  ];
  contract.technical.data_bindings = [
    { from_step: 'moduleA', to_step: 'moduleB', data_object: 'resultA', binding: 'inherit-current', request_fields: ['source_result_a_id'], provenance: 'Record A result ID', correction: 'Choose another A result', staleness: 'Mark B stale when A changes' },
    { from_step: 'moduleB', to_step: 'moduleA', data_object: 'resultB', binding: 'inherit-current', request_fields: ['source_result_b_id'], provenance: 'Record B result ID', correction: 'Choose another B result', staleness: 'Mark A stale when B changes' },
  ];
  await writeFile(contractPath, JSON.stringify(contract));

  const result = run(['contract', 'validate', contractPath, '--json']);
  assert.equal(result.status, 1);
  const errors = JSON.parse(result.stdout).errors;
  assert.ok(errors.some((error) => error.code === 'cyclic-data-dependency'));
  assert.match(errors.find((error) => error.code === 'cyclic-data-dependency').message, /higher-level orchestration boundary/);
});

test('an orchestration boundary keeps participant data dependencies directed', async () => {
  const sandbox = await mkdtemp(join(tmpdir(), 'ifk-orchestration-boundary-test-'));
  const contractPath = join(sandbox, 'orchestration.json');
  const contract = JSON.parse(run(['contract', 'init', 'Orchestrated modules']).stdout);
  contract.flow.steps = [
    { id: 'moduleA', data_boundary: 'module_a', action: 'Publish A result', next: ['moduleB'], reads: [], writes: ['resultA'] },
    { id: 'moduleB', data_boundary: 'module_b', action: 'Publish B result', next: ['coordinate'], reads: [], writes: ['resultB'] },
    { id: 'coordinate', data_boundary: 'orchestration_flow', action: 'Coordinate the next decision from published results', next: [], reads: ['resultA', 'resultB'], writes: ['coordinationState'] },
  ];
  contract.technical.data_objects = [
    { id: 'resultA', kind: 'dataset', identity: 'result_a_id', produced_by: 'moduleA', owner: 'Module A', source_of_truth: 'module_a_results', user_projection: 'A result summary' },
    { id: 'resultB', kind: 'dataset', identity: 'result_b_id', produced_by: 'moduleB', owner: 'Module B', source_of_truth: 'module_b_results', user_projection: 'B result summary' },
    { id: 'coordinationState', kind: 'record', identity: 'coordination_id', produced_by: 'coordinate', owner: 'Orchestration flow', source_of_truth: 'coordination_runs', internal_purpose: 'Own sequencing, termination, retry, and recovery' },
  ];
  contract.technical.data_bindings = [
    { from_step: 'moduleA', to_step: 'coordinate', data_object: 'resultA', binding: 'inherit-current', request_fields: ['source_result_a_id'], provenance: 'Record A result ID', correction: 'Restart coordination with another A result', staleness: 'Keep immutable provenance' },
    { from_step: 'moduleB', to_step: 'coordinate', data_object: 'resultB', binding: 'inherit-current', request_fields: ['source_result_b_id'], provenance: 'Record B result ID', correction: 'Restart coordination with another B result', staleness: 'Keep immutable provenance' },
  ];
  contract.technical.invariants = ['Only orchestration_flow owns coordination state and termination.'];
  await writeFile(contractPath, JSON.stringify(contract));

  const valid = run(['contract', 'validate', contractPath, '--json']);
  assert.equal(valid.status, 0, valid.stderr || valid.stdout);
  assert.equal(JSON.parse(valid.stdout).valid, true);

  const rendered = run(['contract', 'render', contractPath]);
  assert.equal(rendered.status, 0, rendered.stderr);
  assert.match(rendered.stdout, /Data boundary/);
  assert.match(rendered.stdout, /orchestration_flow/);
});

test('implementation path replacement requires deletion of every superseded path', async () => {
  const sandbox = await mkdtemp(join(tmpdir(), 'ifk-implementation-path-invalid-test-'));
  const contractPath = join(sandbox, 'implementation-path.json');
  const contract = JSON.parse(run(['contract', 'init', 'Replace report generation']).stdout);
  contract.technical.implementation_path = {
    capability: 'Report generation',
    strategy: 'replace',
    entries: ['Report page', 'POST /reports'],
    converges_at: 'GenerateReport command',
    state_machine: 'report_runs transitions',
    state_owner: 'Report service',
    side_effect_owner: 'Report worker',
    inspected_paths: ['src/legacy-report-controller.ts'],
    removed_paths: [],
    negative_searches: ['legacy report statuses and worker names'],
    authority_tests: ['All entries converge on GenerateReport'],
    verification: ['Every entry creates the same report run'],
  };
  await writeFile(contractPath, JSON.stringify(contract));

  const missingRemoval = run(['contract', 'validate', contractPath, '--json']);
  assert.equal(missingRemoval.status, 1);
  assert.ok(JSON.parse(missingRemoval.stdout).errors.some((error) => error.code === 'missing-removed-path'));

  contract.technical.implementation_path.legacy_paths = [{ path: 'src/legacy-report-controller.ts', disposition: 'stateless-adapter' }];
  await writeFile(contractPath, JSON.stringify(contract));
  const adapterRejected = run(['contract', 'validate', contractPath, '--json']);
  assert.equal(adapterRejected.status, 1);
  assert.ok(JSON.parse(adapterRejected.stdout).errors.some((error) => error.code === 'unknown-key' && error.path.endsWith('.legacy_paths')));

  delete contract.technical.implementation_path.legacy_paths;
  contract.technical.implementation_path.removed_paths = ['src/old-report-worker.ts'];
  await writeFile(contractPath, JSON.stringify(contract));
  const uninspected = run(['contract', 'validate', contractPath, '--json']);
  assert.equal(uninspected.status, 1);
  assert.ok(JSON.parse(uninspected.stdout).errors.some((error) => error.code === 'uninspected-removed-path'));
});

test('implementation path renders one authoritative state and side-effect path', async () => {
  const sandbox = await mkdtemp(join(tmpdir(), 'ifk-implementation-path-valid-test-'));
  const contractPath = join(sandbox, 'implementation-path.json');
  const contract = JSON.parse(run(['contract', 'init', 'Replace report generation']).stdout);
  contract.technical.implementation_path = {
    capability: 'Report generation',
    strategy: 'replace',
    entries: ['Report page', 'POST /reports', 'Scheduled trigger'],
    converges_at: 'GenerateReport command',
    state_machine: 'report_runs transitions',
    state_owner: 'Report service',
    side_effect_owner: 'Report worker under run_id idempotency',
    inspected_paths: ['src/legacy-report-controller.ts', 'src/old-report-worker.ts', 'src/report-reducer.ts'],
    removed_paths: ['src/legacy-report-controller.ts', 'src/old-report-worker.ts', 'src/report-reducer.ts'],
    negative_searches: ['legacy report statuses', 'old worker names', 'direct artifact writes', 'legacy feature flags'],
    authority_tests: ['All entries invoke GenerateReport', 'Retry reaches only Report worker', 'One run ID produces at most one artifact'],
    verification: [
      'All entries invoke GenerateReport',
      'Only Report worker writes the artifact',
      'Legacy statuses, worker names, and direct side-effect calls have no remaining matches',
    ],
  };
  await writeFile(contractPath, JSON.stringify(contract));

  const valid = run(['contract', 'validate', contractPath, '--json']);
  assert.equal(valid.status, 0, valid.stderr || valid.stdout);
  assert.equal(JSON.parse(valid.stdout).valid, true);

  const rendered = run(['contract', 'render', contractPath]);
  assert.equal(rendered.status, 0, rendered.stderr);
  assert.match(rendered.stdout, /Authoritative implementation path/);
  assert.match(rendered.stdout, /GenerateReport command/);
  assert.match(rendered.stdout, /Report worker under run_id idempotency/);
  assert.match(rendered.stdout, /Removed superseded paths/);
  assert.match(rendered.stdout, /src\/legacy-report-controller.ts/);
  assert.match(rendered.stdout, /Negative searches/);
  assert.match(rendered.stdout, /Authority tests/);
});

test('implementation path supports evolving the one existing path in place', async () => {
  const sandbox = await mkdtemp(join(tmpdir(), 'ifk-implementation-path-evolve-test-'));
  const contractPath = join(sandbox, 'implementation-path.json');
  const contract = JSON.parse(run(['contract', 'init', 'Evolve import validation']).stdout);
  contract.technical.implementation_path = {
    capability: 'Import validation',
    strategy: 'evolve-in-place',
    entries: ['Import page', 'POST /imports'],
    converges_at: 'ValidateImport command',
    state_machine: 'import_jobs transitions',
    state_owner: 'Import service',
    side_effect_owner: 'Import worker',
    inspected_paths: ['src/import-route.ts', 'src/import-worker.ts', 'src/import-store.ts'],
    removed_paths: [],
    negative_searches: ['alternate import commands', 'duplicate import workers', 'direct import writes'],
    authority_tests: ['Both entries invoke ValidateImport', 'Retry reaches only Import worker'],
    verification: ['Existing import_jobs state remains authoritative'],
  };
  await writeFile(contractPath, JSON.stringify(contract));

  contract.technical.implementation_path.removed_paths = ['src/import-worker.ts'];
  await writeFile(contractPath, JSON.stringify(contract));
  const conflictingStrategy = run(['contract', 'validate', contractPath, '--json']);
  assert.equal(conflictingStrategy.status, 1);
  assert.ok(JSON.parse(conflictingStrategy.stdout).errors.some((error) => error.code === 'strategy-conflict'));

  contract.technical.implementation_path.removed_paths = [];
  await writeFile(contractPath, JSON.stringify(contract));
  const valid = run(['contract', 'validate', contractPath, '--json']);
  assert.equal(valid.status, 0, valid.stderr || valid.stdout);
  assert.equal(JSON.parse(valid.stdout).valid, true);
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
