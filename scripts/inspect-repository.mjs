#!/usr/bin/env node

import { existsSync, realpathSync } from 'node:fs';
import { readFile, readdir, stat, realpath } from 'node:fs/promises';
import { basename, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

const DEFAULT_IGNORES = new Set([
  '.git', '.hg', '.svn', '.next', '.nuxt', '.turbo', '.cache',
  'node_modules', 'vendor', 'dist', 'build', 'coverage', 'target',
]);
const TEXT_EXTENSIONS = new Set([
  '.c', '.cc', '.cpp', '.cs', '.css', '.ex', '.exs', '.go', '.graphql',
  '.h', '.hpp', '.html', '.java', '.js', '.json', '.jsx', '.kt', '.kts',
  '.md', '.mjs', '.php', '.prisma', '.proto', '.py', '.rb', '.rs', '.scss',
  '.sh', '.sql', '.svelte', '.swift', '.toml', '.ts', '.tsx', '.vue', '.yaml', '.yml',
]);

const CATEGORIES = [
  {
    id: 'entry-surfaces',
    description: 'Routes, navigation, commands, screens, and user-facing actions.',
    path: /(?:route|router|page|screen|view|component|command|menu|navigation|controller)/i,
    content: /(?:createRouter|Route\b|router\.|navigate\(|href=|onClick=|command\b|action\b|screen\b)/i,
  },
  {
    id: 'state-and-data',
    description: 'Domain models, schemas, persistence, stores, migrations, and lifecycle state.',
    path: /(?:model|schema|entity|domain|store|state|migration|database|repository)/i,
    content: /(?:CREATE TABLE|enum\s+\w*Status|interface\s+\w+State|type\s+\w+State|status\s*[:=]|useStore|migration)/i,
  },
  {
    id: 'interfaces',
    description: 'HTTP/RPC/GraphQL contracts, events, commands, and integration boundaries.',
    path: /(?:api|endpoint|handler|resolver|rpc|graphql|proto|event|webhook|client)/i,
    content: /(?:GET|POST|PUT|PATCH|DELETE|fetch\(|axios\.|request\(|mutation\b|query\b|publish\(|emit\(|subscribe\()/i,
  },
  {
    id: 'background-work',
    description: 'Jobs, queues, schedulers, workers, retries, and durable asynchronous work.',
    path: /(?:job|queue|worker|task|scheduler|cron|background)/i,
    content: /(?:enqueue|dequeue|retry|backoff|worker|schedule|cron|jobId|taskId)/i,
  },
  {
    id: 'permissions-and-risk',
    description: 'Authentication, authorization, tenancy, secrets, validation, and destructive actions.',
    path: /(?:auth|permission|policy|guard|tenant|security|secret|validation)/i,
    content: /(?:authorize|permission|role\b|tenant|authenticate|csrf|secret|redact|validate|delete|archive)/i,
  },
  {
    id: 'observability',
    description: 'Logs, metrics, traces, audit events, analytics, and operational recovery.',
    path: /(?:observability|telemetry|metric|logging|logger|audit|analytics|trace)/i,
    content: /(?:logger\.|console\.|metric|telemetry|trace|span|audit|analytics|track\()/i,
  },
  {
    id: 'verification',
    description: 'Unit, integration, contract, and end-to-end tests that reveal current behavior.',
    path: /(?:^|\/)(?:test|tests|spec|specs|e2e|integration)(?:\/|\.|$)|(?:\.test|\.spec)\./i,
    content: /(?:describe\(|it\(|test\(|expect\(|assert|Given\(|When\(|Then\()/i,
  },
];

function extension(path) {
  const name = basename(path);
  const dot = name.lastIndexOf('.');
  return dot >= 0 ? name.slice(dot).toLowerCase() : '';
}

function tokenize(query = '') {
  return [...new Set(query.toLowerCase().split(/[^\p{L}\p{N}_-]+/u).filter((token) => token.length >= 2))];
}

async function walk(root, current = root, output = []) {
  let entries;
  try { entries = await readdir(current, { withFileTypes: true }); } catch { return output; }
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.isDirectory() && DEFAULT_IGNORES.has(entry.name)) continue;
    const absolute = join(current, entry.name);
    if (entry.isDirectory()) await walk(root, absolute, output);
    else if (entry.isFile()) output.push(absolute);
  }
  return output;
}

function matchingLines(text, patterns, limit = 3) {
  const lines = text.split(/\r?\n/);
  const matches = [];
  for (let index = 0; index < lines.length && matches.length < limit; index += 1) {
    const line = lines[index];
    const signals = patterns.filter(({ regex }) => regex.test(line)).map(({ name }) => name);
    if (signals.length) matches.push({ line: index + 1, text: line.trim().slice(0, 240), signals });
  }
  return matches;
}

export async function inspectRepository({ root = process.cwd(), query = '', maxFiles = 4000, maxPerCategory = 12 } = {}) {
  const requestedRoot = resolve(root);
  if (!existsSync(requestedRoot)) throw new Error(`Repository path does not exist: ${requestedRoot}`);
  if (!(await stat(requestedRoot)).isDirectory()) throw new Error(`Repository path is not a directory: ${requestedRoot}`);
  const repository = await realpath(requestedRoot);

  const terms = tokenize(query);
  const allFiles = await walk(repository);
  const candidates = allFiles.slice(0, maxFiles);
  const categories = Object.fromEntries(CATEGORIES.map((category) => [category.id, []]));
  const queryContext = [];
  let inspectedFiles = 0;
  let skippedLargeFiles = 0;

  for (const absolute of candidates) {
    const file = relative(repository, absolute).replaceAll('\\', '/');
    const ext = extension(file);
    if (!TEXT_EXTENSIONS.has(ext) && !['Dockerfile', 'Makefile'].includes(basename(file))) continue;
    const info = await stat(absolute);
    if (info.size > 512 * 1024) { skippedLargeFiles += 1; continue; }
    let text;
    try { text = await readFile(absolute, 'utf8'); } catch { continue; }
    if (text.includes('\0')) continue;
    inspectedFiles += 1;
    const lowerPath = file.toLowerCase();
    const lowerText = text.toLowerCase();
    const termHits = terms.filter((term) => lowerPath.includes(term) || lowerText.includes(term));
    if (termHits.length) {
      const queryPatterns = termHits.map((term) => ({ name: `query:${term}`, regex: new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') }));
      queryContext.push({
        file,
        score: termHits.length * 3,
        signals: termHits.map((term) => `query:${term}`),
        lines: matchingLines(text, queryPatterns),
      });
    }

    for (const category of CATEGORIES) {
      const pathSignal = category.path.test(file);
      const contentSignal = category.content.test(text);
      if (!pathSignal && !contentSignal) continue;
      const patterns = [
        ...(contentSignal ? [{ name: category.id, regex: category.content }] : []),
        ...termHits.map((term) => ({ name: `query:${term}`, regex: new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') })),
      ];
      const lines = matchingLines(text, patterns);
      const score = (pathSignal ? 2 : 0) + (contentSignal ? 2 : 0) + termHits.length * 3 + Math.min(lines.length, 2);
      categories[category.id].push({ file, score, signals: [pathSignal ? 'path' : null, contentSignal ? 'content' : null, ...termHits.map((term) => `query:${term}`)].filter(Boolean), lines });
    }
  }

  const sections = CATEGORIES.map((category) => ({
    id: category.id,
    description: category.description,
    matches: categories[category.id].sort((a, b) => b.score - a.score || a.file.localeCompare(b.file)).slice(0, maxPerCategory),
  })).filter((section) => section.matches.length);
  if (queryContext.length) {
    sections.unshift({
      id: 'feature-context',
      description: 'Files containing the requested feature terms. These establish context but not a technical category by themselves.',
      matches: queryContext.sort((a, b) => b.score - a.score || a.file.localeCompare(b.file)).slice(0, maxPerCategory),
    });
  }

  return {
    repository,
    query,
    summary: { discoveredFiles: allFiles.length, consideredFiles: candidates.length, inspectedFiles, skippedLargeFiles, truncated: allFiles.length > maxFiles },
    sections,
    caveat: 'These are deterministic evidence candidates, not architectural conclusions. Inspect relevant matches before making claims.',
  };
}

export function renderInspectionMarkdown(report) {
  const lines = [
    '# Repository interaction evidence',
    '',
    `- Repository: \`${report.repository}\``,
    `- Query: ${report.query ? `\`${report.query}\`` : '_none_'}`,
    `- Inspected: ${report.summary.inspectedFiles} text files (${report.summary.discoveredFiles} discovered)`,
    '',
    `> ${report.caveat}`,
  ];
  for (const section of report.sections) {
    lines.push('', `## ${section.id}`, '', section.description, '');
    for (const match of section.matches) {
      lines.push(`- \`${match.file}\` — ${match.signals.join(', ')}`);
      for (const hit of match.lines) lines.push(`  - L${hit.line}: \`${hit.text.replaceAll('`', '\`')}\``);
    }
  }
  return `${lines.join('\n')}\n`;
}

function parseCli(argv) {
  const options = { root: process.cwd(), query: '', format: 'markdown' };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--root') options.root = argv[++index];
    else if (value === '--query') options.query = argv[++index];
    else if (value === '--json') options.format = 'json';
    else if (value === '--max-files') options.maxFiles = Number(argv[++index]);
    else if (value === '--max-per-category') options.maxPerCategory = Number(argv[++index]);
    else throw new Error(`Unknown option: ${value}`);
  }
  return options;
}

async function main() {
  const options = parseCli(process.argv.slice(2));
  const report = await inspectRepository(options);
  process.stdout.write(options.format === 'json' ? `${JSON.stringify(report, null, 2)}\n` : renderInspectionMarkdown(report));
}

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  main().catch((error) => { process.stderr.write(`Error: ${error.message}\n`); process.exitCode = 1; });
}
