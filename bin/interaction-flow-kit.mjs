#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { access, cp, mkdir, mkdtemp, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline/promises';
import process from 'node:process';
import { inspectRepository, renderInspectionMarkdown } from '../scripts/inspect-repository.mjs';
import { createContract, readContract, renderContract, validateContract } from '../scripts/flow-contract.mjs';

const SKILL_NAME = 'interaction-flow-kit';
const MANIFEST_NAME = '.interaction-flow-kit-install.json';
const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PACKAGE_JSON = JSON.parse(await readFile(join(PACKAGE_ROOT, 'package.json'), 'utf8'));
const COPY_ENTRIES = ['SKILL.md', 'agents', 'references', 'schemas', 'scripts'];
const TARGET_ORDER = ['agents', 'codex', 'claude', 'trae', 'trae-cli', 'opencode'];
const SCOPES = new Set(['project', 'global']);
const TARGET_ALIASES = { default: 'agents', traecli: 'trae-cli', 'trae-code': 'trae-cli', traecode: 'trae-cli', 'open-code': 'opencode' };

const TARGETS = {
  agents: {
    label: 'Agent Skills (.agents)',
    project: (context) => join(context.projectRoot, '.agents', 'skills'),
    global: (context) => join(context.home, '.agents', 'skills'),
  },
  codex: {
    label: 'Codex',
    project: (context) => join(context.projectRoot, '.agents', 'skills'),
    global: (context) => join(context.env.CODEX_HOME ? resolve(context.env.CODEX_HOME) : join(context.home, '.codex'), 'skills'),
  },
  claude: {
    label: 'Claude Code',
    project: (context) => join(context.projectRoot, '.claude', 'skills'),
    global: (context) => join(context.home, '.claude', 'skills'),
  },
  trae: {
    label: 'Trae IDE',
    project: (context) => join(context.projectRoot, '.trae', 'skills'),
    global: (context) => join(context.home, '.trae', 'skills'),
  },
  'trae-cli': {
    label: 'TraeCode CLI',
    project: (context) => join(context.projectRoot, '.traecli', 'skills'),
    global: (context) => join(context.home, '.traecli', 'skills'),
  },
  opencode: {
    label: 'OpenCode',
    project: (context) => join(context.projectRoot, '.opencode', 'skills'),
    global: (context) => join(context.env.XDG_CONFIG_HOME ? resolve(context.env.XDG_CONFIG_HOME) : join(context.home, '.config'), 'opencode', 'skills'),
  },
};

class CliError extends Error {
  constructor(message, hint, exitCode = 1) {
    super(message);
    this.hint = hint;
    this.exitCode = exitCode;
  }
}

function requireOptionValue(argv, index, option) {
  const next = argv[index + 1];
  if (!next || next.startsWith('-')) throw new CliError(`${option} requires a value.`, `Run interaction-flow-kit help for examples.`, 2);
  return next;
}

function parseArgs(argv) {
  const options = { json: false, force: false, yes: false, purge: false, scope: 'project', target: 'agents', targetSpecified: false, scopeSpecified: false };
  const positionals = [];
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--json') options.json = true;
    else if (value === '--force') options.force = true;
    else if (value === '--yes' || value === '-y') options.yes = true;
    else if (value === '--purge') options.purge = true;
    else if (value === '--dest') { options.dest = requireOptionValue(argv, index, '--dest'); index += 1; }
    else if (value === '--target' || value === '-t') { options.target = requireOptionValue(argv, index, '--target'); options.targetSpecified = true; index += 1; }
    else if (value.startsWith('--target=')) { options.target = value.slice('--target='.length); options.targetSpecified = true; }
    else if (value === '--scope' || value === '-s') { options.scope = requireOptionValue(argv, index, '--scope'); options.scopeSpecified = true; index += 1; }
    else if (value.startsWith('--scope=')) { options.scope = value.slice('--scope='.length); options.scopeSpecified = true; }
    else if (value === '--project-root') { options.projectRoot = requireOptionValue(argv, index, '--project-root'); index += 1; }
    else if (value === '--root') { options.root = requireOptionValue(argv, index, '--root'); index += 1; }
    else if (value === '--query' || value === '-q') { options.query = requireOptionValue(argv, index, '--query'); index += 1; }
    else if (value === '--max-files') { options.maxFiles = Number(requireOptionValue(argv, index, '--max-files')); index += 1; }
    else if (value === '--max-per-category') { options.maxPerCategory = Number(requireOptionValue(argv, index, '--max-per-category')); index += 1; }
    else if (value === '--help' || value === '-h') options.help = true;
    else if (value === '--version' || value === '-v') options.version = true;
    else if (value.startsWith('-')) throw new CliError(`Unknown option: ${value}`, 'Run interaction-flow-kit help to see supported options.', 2);
    else positionals.push(value);
  }
  if (!SCOPES.has(options.scope)) throw new CliError(`Unknown scope: ${options.scope}`, 'Choose project or global.', 2);
  if (options.dest && (options.targetSpecified || options.scopeSpecified || options.projectRoot)) {
    throw new CliError('--dest cannot be combined with --target or --scope.', 'Use --dest alone for one custom skills directory.', 2);
  }
  return { options, positionals };
}

function findProjectRoot(start) {
  let current = resolve(start);
  while (true) {
    if (existsSync(join(current, '.git'))) return current;
    const parent = dirname(current);
    if (parent === current) return resolve(start);
    current = parent;
  }
}

function parseTargetIds(raw) {
  const requested = raw.split(',').map((value) => value.trim().toLowerCase()).filter(Boolean).map((id) => TARGET_ALIASES[id] ?? id);
  if (!requested.length) throw new CliError('--target cannot be empty.', `Choose ${TARGET_ORDER.join(', ')}, or all.`, 2);
  const expanded = requested.includes('all') ? TARGET_ORDER : requested;
  const invalid = expanded.filter((id) => !TARGETS[id]);
  if (invalid.length) throw new CliError(`Unknown target${invalid.length > 1 ? 's' : ''}: ${invalid.join(', ')}`, `Choose ${TARGET_ORDER.join(', ')}, or all.`, 2);
  return [...new Set(expanded)];
}

function installContext(options, env = process.env) {
  return { env, home: homedir(), projectRoot: options.projectRoot ? resolve(options.projectRoot) : findProjectRoot(process.cwd()) };
}

function resolveInstallTargets(options) {
  if (options.dest) {
    const skillsDir = resolve(options.dest);
    return [{ id: 'custom', label: 'Custom', scope: 'custom', skillsDir, skillDir: join(skillsDir, SKILL_NAME) }];
  }

  const context = installContext(options);
  const targets = parseTargetIds(options.target).map((id) => {
    const skillsDir = resolve(TARGETS[id][options.scope](context));
    return { id, label: TARGETS[id].label, scope: options.scope, skillsDir, skillDir: join(skillsDir, SKILL_NAME) };
  });

  // Compatibility targets can resolve to the same directory (for example
  // project-level agents + Codex). Install once and retain all target labels.
  const deduped = new Map();
  for (const target of targets) {
    const existing = deduped.get(target.skillDir);
    if (existing) {
      existing.ids.push(target.id);
      existing.labels.push(target.label);
    } else {
      deduped.set(target.skillDir, { ...target, ids: [target.id], labels: [target.label] });
    }
  }
  return [...deduped.values()];
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function print(value, json = false) {
  process.stdout.write(json ? `${JSON.stringify(value, null, 2)}\n` : `${value}\n`);
}

async function listFiles(root, prefix = '') {
  const entries = await readdir(join(root, prefix), { withFileTypes: true });
  const files = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.name === MANIFEST_NAME) continue;
    const relative = join(prefix, entry.name);
    if (entry.isDirectory()) files.push(...await listFiles(root, relative));
    else if (entry.isFile()) files.push(relative);
  }
  return files;
}

async function fingerprint(root) {
  const hash = createHash('sha256');
  for (const entry of COPY_ENTRIES) {
    const path = join(root, entry);
    if (!existsSync(path)) continue;
    const info = await stat(path);
    const files = info.isDirectory() ? await listFiles(root, entry) : [entry];
    for (const relative of files) {
      hash.update(relative);
      hash.update('\0');
      hash.update(await readFile(join(root, relative)));
      hash.update('\0');
    }
  }
  return hash.digest('hex');
}

async function skillFiles(root) {
  const files = [];
  for (const entry of COPY_ENTRIES) {
    const path = join(root, entry);
    if (!existsSync(path)) continue;
    const info = await stat(path);
    files.push(...(info.isDirectory() ? await listFiles(root, entry) : [entry]));
  }
  return files;
}

function parseFrontmatter(text) {
  const match = text.match(/^---\n([\s\S]*?)\n---(?:\n|$)/);
  if (!match) throw new CliError('SKILL.md has no valid YAML frontmatter.', 'Restore the opening and closing --- delimiters.');
  const fields = {};
  for (const line of match[1].split('\n')) {
    const field = line.match(/^([a-zA-Z0-9_-]+):\s*(.+)$/);
    if (field) fields[field[1]] = field[2].replace(/^['"]|['"]$/g, '');
  }
  return fields;
}

async function validateSkill(root) {
  const errors = [];
  const skillPath = join(root, 'SKILL.md');
  if (!existsSync(skillPath)) return { valid: false, root, errors: ['SKILL.md is missing.'], references: [] };

  let skillText = '';
  try {
    skillText = await readFile(skillPath, 'utf8');
    const fields = parseFrontmatter(skillText);
    if (fields.name !== SKILL_NAME) errors.push(`SKILL.md name must be ${SKILL_NAME}.`);
    if (!fields.description) errors.push('SKILL.md description is missing.');
  } catch (error) {
    errors.push(error.message);
  }

  const references = [...skillText.matchAll(/\[[^\]]+\]\((references\/[^)#]+)(?:#[^)]+)?\)/g)].map((match) => match[1]);
  for (const reference of new Set(references)) if (!existsSync(join(root, reference))) errors.push(`Broken reference: ${reference}`);

  const openaiYaml = join(root, 'agents', 'openai.yaml');
  if (!existsSync(openaiYaml)) errors.push('agents/openai.yaml is missing.');
  else if (!(await readFile(openaiYaml, 'utf8')).includes(`$${SKILL_NAME}`)) errors.push('agents/openai.yaml default_prompt must mention $interaction-flow-kit.');

  for (const required of ['scripts/inspect-repository.mjs', 'scripts/flow-contract.mjs', 'schemas/flow-contract.schema.json']) {
    if (!existsSync(join(root, required))) errors.push(`Required runtime resource is missing: ${required}`);
  }

  const placeholders = [];
  for (const relative of await skillFiles(root)) {
    if (!relative.endsWith('.md') && !relative.endsWith('.yaml')) continue;
    const contents = await readFile(join(root, relative), 'utf8');
    if (/\[TODO:|PLACEHOLDER|Replace this/i.test(contents)) placeholders.push(relative);
    if (relative.endsWith('.md')) {
      for (const match of contents.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
        const rawLink = match[1].trim().split(/\s+/)[0];
        if (!rawLink || rawLink.startsWith('#') || /^(https?:|mailto:)/i.test(rawLink)) continue;
        const localPath = rawLink.split('#')[0];
        if (!existsSync(resolve(dirname(join(root, relative)), localPath)) && !(relative === 'SKILL.md' && rawLink.startsWith('references/'))) {
          errors.push(`Broken link in ${relative}: ${rawLink}`);
        }
      }
    }
  }
  if (placeholders.length) errors.push(`Unfinished placeholders: ${placeholders.join(', ')}`);
  return { valid: errors.length === 0, root, errors, references: [...new Set(references)] };
}

async function readManifest(skillDir) {
  try { return JSON.parse(await readFile(join(skillDir, MANIFEST_NAME), 'utf8')); } catch { return null; }
}

async function getTargetStatus(target, bundledFingerprint) {
  const installed = existsSync(join(target.skillDir, 'SKILL.md'));
  const installedFingerprint = installed ? await fingerprint(target.skillDir) : null;
  const manifest = installed ? await readManifest(target.skillDir) : null;
  return {
    ...target,
    name: SKILL_NAME,
    packageVersion: PACKAGE_JSON.version,
    installed,
    managed: Boolean(manifest?.managedBy === SKILL_NAME),
    installedVersion: manifest?.version ?? null,
    current: installedFingerprint === bundledFingerprint,
    bundledFingerprint,
    installedFingerprint,
  };
}

async function getStatuses(options) {
  const bundledFingerprint = await fingerprint(PACKAGE_ROOT);
  return Promise.all(resolveInstallTargets(options).map((target) => getTargetStatus(target, bundledFingerprint)));
}

async function backupExisting(skillDir, skillsDir, label = 'backup') {
  const backupDir = join(skillsDir, `.${SKILL_NAME}-${label}-${timestamp()}`);
  await rename(skillDir, backupDir);
  return backupDir;
}

function installConflict(status, options, verb) {
  if (!status.installed || status.current) return null;
  if (!status.managed && !options.force) return `unmanaged skill at ${status.skillDir}`;
  if (verb === 'install' && !options.force) return `different installation at ${status.skillDir}; use upgrade or --force`;
  return null;
}

async function installOne(status) {
  await mkdir(status.skillsDir, { recursive: true });
  let backupDir = null;
  if (status.installed && !status.current) backupDir = await backupExisting(status.skillDir, status.skillsDir);
  if (status.current) return { ok: true, action: 'unchanged', ...status, backupDir: null };

  const stagingRoot = await mkdtemp(join(status.skillsDir, `.${SKILL_NAME}-install-`));
  const stagedSkill = join(stagingRoot, SKILL_NAME);
  try {
    await mkdir(stagedSkill, { recursive: true });
    for (const entry of COPY_ENTRIES) await cp(join(PACKAGE_ROOT, entry), join(stagedSkill, entry), { recursive: true });
    await writeFile(join(stagedSkill, MANIFEST_NAME), `${JSON.stringify({
      managedBy: SKILL_NAME,
      version: PACKAGE_JSON.version,
      installedAt: new Date().toISOString(),
      sourceFingerprint: status.bundledFingerprint,
      targets: status.ids ?? [status.id],
      scope: status.scope,
    }, null, 2)}\n`);
    await rename(stagedSkill, status.skillDir);
  } catch (error) {
    if (backupDir && !existsSync(status.skillDir)) await rename(backupDir, status.skillDir);
    throw new CliError(`Installation failed at ${status.skillDir}: ${error.message}`, 'The previous installation was preserved when possible. Run interaction-flow-kit doctor with the same target and scope.');
  } finally {
    await rm(stagingRoot, { recursive: true, force: true });
  }
  return { ok: true, action: status.installed ? 'updated' : 'installed', ...status, backupDir };
}

async function install(options, verb = 'install') {
  const source = await validateSkill(PACKAGE_ROOT);
  if (!source.valid) throw new CliError(`Bundled skill is invalid: ${source.errors.join(' ')}`, 'Run interaction-flow-kit validate for details.');
  const statuses = await getStatuses(options);
  const conflicts = statuses.map((status) => installConflict(status, options, verb)).filter(Boolean);
  if (conflicts.length) throw new CliError(`Refusing to modify ${conflicts.join('; ')}.`, verb === 'install' ? 'Use upgrade for managed copies, or --force after review.' : 'Use --force only after reviewing the exact directories.');

  const results = [];
  for (const status of statuses) results.push(await installOne(status));
  const payload = { ok: true, action: verb, scope: options.dest ? 'custom' : options.scope, results, next: 'Start a new Agent session or turn, then invoke $interaction-flow-kit.' };
  if (options.json) print(payload, true);
  else {
    for (const result of results) {
      print(`${result.action === 'unchanged' ? '✓ Already current' : result.action === 'installed' ? '✓ Installed' : '✓ Updated'} ${result.labels?.join(' + ') ?? result.label}: ${result.skillDir}`);
      if (result.backupDir) print(`  Previous copy: ${result.backupDir}`);
    }
    print(`Next: ${payload.next}`);
  }
}

async function confirmRemoval(statuses, options) {
  if (options.yes) return true;
  if (!process.stdin.isTTY) throw new CliError('Uninstall requires confirmation in a non-interactive shell.', 'Rerun with --yes.');
  const prompt = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await prompt.question(`Remove ${statuses.map((status) => status.skillDir).join(', ')}? [y/N] `);
  prompt.close();
  return /^y(es)?$/i.test(answer.trim());
}

async function uninstall(options) {
  const statuses = await getStatuses(options);
  const installed = statuses.filter((status) => status.installed);
  const unmanaged = installed.filter((status) => !status.managed);
  if (unmanaged.length && !options.force) throw new CliError(`Refusing to remove unmanaged skill${unmanaged.length > 1 ? 's' : ''}: ${unmanaged.map((status) => status.skillDir).join(', ')}`, 'Use --force only after reviewing every exact directory.');
  if (!installed.length) {
    const payload = { ok: true, action: 'not-installed', results: statuses };
    return print(options.json ? payload : 'Nothing to remove for the selected targets.', options.json);
  }
  if (!await confirmRemoval(installed, options)) return print(options.json ? { ok: true, action: 'cancelled', results: installed } : 'Cancelled.', options.json);

  const results = [];
  for (const status of installed) {
    if (options.purge) {
      await rm(status.skillDir, { recursive: true, force: true });
      results.push({ ...status, action: 'purged', recoverable: false });
    } else {
      const backupDir = await backupExisting(status.skillDir, status.skillsDir, 'removed');
      results.push({ ...status, action: 'removed', backupDir, recoverable: true });
    }
  }
  const payload = { ok: true, action: options.purge ? 'purged' : 'removed', results };
  if (options.json) print(payload, true);
  else for (const result of results) {
    print(`✓ ${result.action === 'purged' ? 'Permanently removed' : 'Removed'} ${result.labels?.join(' + ') ?? result.label}: ${result.skillDir}`);
    if (result.backupDir) print(`  Recoverable copy: ${result.backupDir}`);
  }
}

async function doctor(options) {
  const statuses = await getStatuses(options);
  const source = await validateSkill(PACKAGE_ROOT);
  const results = [];
  for (const status of statuses) {
    let destinationWritable = false;
    let writableProbe = status.skillsDir;
    while (!existsSync(writableProbe) && dirname(writableProbe) !== writableProbe) writableProbe = dirname(writableProbe);
    try { await access(writableProbe, constants.W_OK); destinationWritable = true; } catch { /* reported */ }
    const installedValidation = status.installed ? await validateSkill(status.skillDir) : null;
    const checks = [
      { name: 'bundled-skill', ok: source.valid, detail: source.valid ? 'valid' : source.errors.join(' ') },
      { name: 'node-version', ok: Number(process.versions.node.split('.')[0]) >= 20, detail: process.version },
      { name: 'destination-writable', ok: destinationWritable, detail: `${status.skillsDir} (checked ${writableProbe})` },
      { name: 'installed', ok: status.installed, detail: status.installed ? status.skillDir : 'not installed' },
      { name: 'installed-skill', ok: installedValidation?.valid ?? false, detail: installedValidation ? (installedValidation.valid ? 'valid' : installedValidation.errors.join(' ')) : 'install first' },
      { name: 'version-current', ok: status.current, detail: status.current ? PACKAGE_JSON.version : 'bundled and installed content differ' },
    ];
    results.push({ ...status, ok: checks.every((check) => check.ok), checks });
  }
  const ok = results.every((result) => result.ok);
  const selectedArgs = options.dest ? `--dest ${resolve(options.dest)}` : `--target ${options.target} --scope ${options.scope}${options.projectRoot ? ` --project-root ${resolve(options.projectRoot)}` : ''}`;
  const next = results.some((result) => !result.installed) ? `interaction-flow-kit install ${selectedArgs}` : results.some((result) => !result.current) ? `interaction-flow-kit upgrade ${selectedArgs}` : null;
  const payload = { ok, results, next };
  if (options.json) print(payload, true);
  else {
    for (const result of results) {
      print(`\n${result.labels?.join(' + ') ?? result.label} — ${result.skillDir}`);
      for (const check of result.checks) print(`${check.ok ? '✓' : '✗'} ${check.name}: ${check.detail}`);
    }
    if (next) print(`\nNext: ${next}`);
  }
  if (!ok) process.exitCode = 1;
}

function promptTemplate(mode = 'plan') {
  const templates = {
    plan: 'Use $interaction-flow-kit while planning and implementing this feature. Infer the underlying user job and downstream use rather than implementing the request noun in isolation. Keep the Flow Contract concise and embed usability decisions in the implementation plan; create diagrams only if they remove real ambiguity.',
    review: 'Use $interaction-flow-kit to review this feature from the intent trigger through downstream use. Lead with evidence-backed usability findings and give the smallest coherent fix plus job-level acceptance criteria.',
    spec: 'Use $interaction-flow-kit while writing this spec. Infer the job behind the request, test whether the named capability actually completes it, and resolve the relevant lifecycle, discoverability, minimum input, feedback, recovery, and re-entry without unnecessary artifacts.',
    prd: 'Use $interaction-flow-kit to produce an implementation-oriented PRD. Inspect the existing system, infer the underlying job and downstream outcome, design the user flow and Technical Design Contract together, record consequential trade-offs, and connect rollout and verification to product promises. Keep detail proportional.',
    design: 'Use $interaction-flow-kit to design this feature end to end. Begin with the underlying job and how the result will be used, then combine the usable product flow with evidence-backed system boundaries, data/state ownership, interfaces, failure semantics, rollout, and verification; use diagrams only where they clarify a consequential decision.',
  };
  if (!templates[mode]) throw new CliError(`Unknown prompt mode: ${mode}`, 'Choose plan, spec, prd, design, or review.', 2);
  return templates[mode];
}

function help() {
  return `Interaction Flow Kit ${PACKAGE_JSON.version}

Keep product flows easy to discover, understand, complete, recover, and use.

Usage:
  interaction-flow-kit <command> [options]
  ifk <command> [options]

Commands:
  inspect              Find repository evidence for interaction and technical design
  contract init        Create a minimal editable JSON flow contract
  contract validate    Validate a JSON flow contract and graph references
  contract render      Render a valid contract to Markdown, Mermaid, and tables
  install              Install for one or more Agents
  upgrade              Sync selected installations to this CLI version
  status               Show selected installation and content status
  doctor               Diagnose selected destinations and installations
  validate [path]      Validate a skill directory
  prompt [mode]        Print an Agent prompt: plan, spec, prd, design, or review
  uninstall            Remove selected managed installations
  targets              List supported Agent targets and resolved paths
  version              Print the CLI version
  help                 Show this help

Targeting:
  --target, -t <list>  agents (default), codex, claude, trae, trae-cli, opencode, or all
  --scope, -s <scope>  project (default) or global
  --project-root <dir> Project root for project-scoped installation (default: cwd)
  --dest <dir>         One custom skills directory; cannot combine with target/scope

Safety and automation:
  --json               Machine-readable output
  --force              Replace/remove unmanaged exact targets after backing them up
  --yes, -y            Skip uninstall confirmation
  --purge              Permanently delete instead of moving to recoverable backups

Design tools:
  --root <dir>         Repository to inspect (default: cwd)
  --query, -q <text>   Feature terms used to rank repository evidence
  --max-files <n>      Bound repository scan work (default: 4000)
  --max-per-category   Bound evidence returned per category (default: 12)

Examples:
  ifk inspect --root . --query "export configuration"
  ifk inspect --root . --query "approval flow" --json
  ifk contract validate flow-contract.json --json
  ifk contract render flow-contract.json > flow-design.md
  ifk install
  ifk install --scope global
  ifk install --target claude --scope project
  ifk install --target codex,claude,trae,opencode --scope global
  ifk status --target all --scope project --json
  ifk uninstall --target all --scope project --yes`;
}

async function printStatus(options) {
  const statuses = await getStatuses(options);
  const payload = { ok: statuses.every((status) => status.installed && status.current), scope: options.dest ? 'custom' : options.scope, results: statuses };
  if (options.json) print(payload, true);
  else for (const status of statuses) {
    const names = status.labels?.join(' + ') ?? status.label;
    print(`${status.installed ? '✓' : '✗'} ${names}: ${status.installed ? status.skillDir : `not installed (${status.skillDir})`}`);
    if (status.installed) print(`  ${status.current ? '✓ current' : '✗ content differs — run upgrade with the same target and scope'}`);
  }
  if (!payload.ok) process.exitCode = 1;
}

async function main() {
  const { options, positionals } = parseArgs(process.argv.slice(2));
  if (options.version) return print(PACKAGE_JSON.version);
  const command = positionals[0] ?? 'help';
  const args = positionals.slice(1);
  if (options.help && command !== 'help') return print(help());

  switch (command) {
    case 'help': return print(help());
    case 'version': return print(PACKAGE_JSON.version);
    case 'targets': {
      const results = resolveInstallTargets(options);
      return print(options.json ? { scope: options.dest ? 'custom' : options.scope, results } : results.map((target) => `${target.ids?.join(',') ?? target.id}\t${target.skillDir}`).join('\n'), options.json);
    }
    case 'inspect': {
      const report = await inspectRepository({
        root: options.root ?? process.cwd(),
        query: options.query ?? args.join(' '),
        maxFiles: options.maxFiles,
        maxPerCategory: options.maxPerCategory,
      });
      if (options.json) return print(report, true);
      process.stdout.write(renderInspectionMarkdown(report));
      return;
    }
    case 'contract': {
      const operation = args[0] ?? 'validate';
      if (operation === 'init') return print(createContract(args.slice(1).join(' ') || 'Feature name'), true);
      const path = args[1];
      if (!path) throw new CliError('contract requires a JSON file.', 'Run ifk contract init "Feature name" > flow-contract.json.', 2);
      const contract = await readContract(path);
      if (operation === 'validate') {
        const result = validateContract(contract);
        if (options.json) print(result, true);
        else if (result.valid) print('✓ Valid flow contract' + (result.warnings.length ? ' (' + result.warnings.length + ' warnings)' : ''));
        else for (const item of result.errors) print('✗ ' + item.path + ': ' + item.message);
        if (!result.valid) process.exitCode = 1;
        return;
      }
      if (operation === 'render') {
        process.stdout.write(renderContract(contract));
        return;
      }
      throw new CliError('Unknown contract operation: ' + operation, 'Choose init, validate, or render.', 2);
    }
    case 'install': return install(options, 'install');
    case 'upgrade': return install(options, 'upgrade');
    case 'status': return printStatus(options);
    case 'doctor': return doctor(options);
    case 'validate': {
      const target = resolve(args[0] ?? PACKAGE_ROOT);
      const result = await validateSkill(target);
      if (options.json) print(result, true);
      else if (result.valid) print(`✓ Valid skill: ${target}`);
      else for (const error of result.errors) print(`✗ ${error}`);
      if (!result.valid) process.exitCode = 1;
      return;
    }
    case 'prompt': return print(promptTemplate(args[0] ?? 'plan'));
    case 'uninstall': return uninstall(options);
    default: throw new CliError(`Unknown command: ${command}`, 'Run interaction-flow-kit help.', 2);
  }
}

try {
  await main();
} catch (error) {
  const cliError = error instanceof CliError ? error : new CliError(error.message ?? String(error), 'Run interaction-flow-kit doctor for diagnostics.');
  process.stderr.write(`Error: ${cliError.message}\n`);
  if (cliError.hint) process.stderr.write(`Next: ${cliError.hint}\n`);
  process.exitCode = cliError.exitCode;
}
