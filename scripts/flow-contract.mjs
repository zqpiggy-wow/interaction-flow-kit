#!/usr/bin/env node

import { existsSync, realpathSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

const ID_PATTERN = /^[A-Za-z][A-Za-z0-9_-]*$/;
const isObject = (value) => value && typeof value === 'object' && !Array.isArray(value);
const isText = (value) => typeof value === 'string' && value.trim().length > 0;

export function createContract(feature = 'Feature name') {
  return {
    feature,
    intent: {
      actor: 'Primary user',
      trigger: 'What causes the need to arise',
      stated_means: 'What capability was requested',
      desired_change: 'What should become possible, easier, or safer',
      completion: 'Observable evidence that the user job is complete',
      constraints: [],
      assumptions: [],
    },
    flow: {
      entry: 'Where intent naturally arises',
      steps: [
        {
          id: 'start',
          actor: 'Primary user',
          action: 'Start the task',
          system_effect: 'Create or change authoritative state',
          feedback: 'Show the accepted action and current state',
          next: ['complete'],
        },
        {
          id: 'complete',
          actor: 'Primary user',
          action: 'Use the result',
          system_effect: 'Expose the changed state or result',
          feedback: 'Show completion and the next useful action',
          next: [],
        },
      ],
      continuation: 'How the changed state or result completes the job',
      recovery: [],
    },
    technical: {
      owners: [],
      interfaces: [],
      data_flows: [],
      invariants: [],
      verification: [],
    },
  };
}

function addError(errors, path, code, message) {
  errors.push({ path, code, message });
}

function requireText(value, path, errors) {
  if (!isText(value)) addError(errors, path, 'required-text', 'Expected a non-empty string.');
}

function checkStringArray(value, path, errors) {
  if (value === undefined) return;
  if (!Array.isArray(value)) {
    addError(errors, path, 'type', 'Expected an array of non-empty strings.');
    return;
  }
  const seen = new Set();
  value.forEach((item, index) => {
    requireText(item, path + '[' + index + ']', errors);
    if (isText(item) && seen.has(item)) addError(errors, path + '[' + index + ']', 'duplicate', 'Duplicate value.');
    seen.add(item);
  });
}

function checkKeys(value, allowed, path, errors) {
  if (!isObject(value)) return;
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) addError(errors, path + '.' + key, 'unknown-key', 'Unknown property.');
  }
}

export function validateContract(contract) {
  const errors = [];
  const warnings = [];
  if (!isObject(contract)) {
    return { valid: false, errors: [{ path: '$', code: 'type', message: 'Contract must be a JSON object.' }], warnings };
  }

  checkKeys(contract, new Set(['feature', 'intent', 'flow', 'technical']), '$', errors);
  requireText(contract.feature, '$.feature', errors);

  if (!isObject(contract.intent)) addError(errors, '$.intent', 'type', 'Expected an intent object.');
  else {
    checkKeys(contract.intent, new Set(['actor', 'trigger', 'stated_means', 'desired_change', 'completion', 'constraints', 'assumptions']), '$.intent', errors);
    requireText(contract.intent.trigger, '$.intent.trigger', errors);
    requireText(contract.intent.desired_change, '$.intent.desired_change', errors);
    requireText(contract.intent.completion, '$.intent.completion', errors);
    checkStringArray(contract.intent.constraints, '$.intent.constraints', errors);
    checkStringArray(contract.intent.assumptions, '$.intent.assumptions', errors);
    if (!isText(contract.intent.actor)) warnings.push({ path: '$.intent.actor', code: 'missing-actor', message: 'Actor is useful when roles or permissions affect the flow.' });
  }

  if (!isObject(contract.flow)) addError(errors, '$.flow', 'type', 'Expected a flow object.');
  else {
    checkKeys(contract.flow, new Set(['entry', 'steps', 'continuation', 'recovery']), '$.flow', errors);
    requireText(contract.flow.entry, '$.flow.entry', errors);
    requireText(contract.flow.continuation, '$.flow.continuation', errors);
    if (!Array.isArray(contract.flow.steps) || !contract.flow.steps.length) {
      addError(errors, '$.flow.steps', 'min-items', 'Expected at least one flow step.');
    } else {
      const ids = new Map();
      contract.flow.steps.forEach((step, index) => {
        const path = '$.flow.steps[' + index + ']';
        if (!isObject(step)) {
          addError(errors, path, 'type', 'Expected a step object.');
          return;
        }
        checkKeys(step, new Set(['id', 'actor', 'action', 'system_effect', 'feedback', 'next']), path, errors);
        requireText(step.id, path + '.id', errors);
        requireText(step.action, path + '.action', errors);
        if (isText(step.id) && !ID_PATTERN.test(step.id)) addError(errors, path + '.id', 'id-format', 'Use letters, digits, _ or -, starting with a letter.');
        if (isText(step.id) && ids.has(step.id)) addError(errors, path + '.id', 'duplicate-id', 'Duplicate step id; first used at index ' + ids.get(step.id) + '.');
        if (isText(step.id)) ids.set(step.id, index);
        checkStringArray(step.next, path + '.next', errors);
        if (!isText(step.feedback)) warnings.push({ path: path + '.feedback', code: 'missing-feedback', message: 'No user-visible feedback is specified.' });
      });
      contract.flow.steps.forEach((step, index) => {
        if (!isObject(step) || !Array.isArray(step.next)) return;
        for (const next of step.next) {
          if (isText(next) && !ids.has(next)) addError(errors, '$.flow.steps[' + index + '].next', 'unknown-step', 'Unknown next step: ' + next + '.');
        }
      });
      const first = contract.flow.steps[0] && contract.flow.steps[0].id;
      if (isText(first)) {
        const reachable = new Set();
        const queue = [first];
        while (queue.length) {
          const id = queue.shift();
          if (reachable.has(id)) continue;
          reachable.add(id);
          const step = contract.flow.steps[ids.get(id)];
          for (const next of (step && step.next) || []) if (ids.has(next)) queue.push(next);
        }
        contract.flow.steps.forEach((step, index) => {
          if (isText(step && step.id) && !reachable.has(step.id)) warnings.push({ path: '$.flow.steps[' + index + ']', code: 'unreachable-step', message: 'Step ' + step.id + ' is not reachable from ' + first + '.' });
        });
      }
    }

    if (contract.flow.recovery !== undefined) {
      if (!Array.isArray(contract.flow.recovery)) addError(errors, '$.flow.recovery', 'type', 'Expected an array.');
      else contract.flow.recovery.forEach((item, index) => {
        const path = '$.flow.recovery[' + index + ']';
        if (!isObject(item)) {
          addError(errors, path, 'type', 'Expected a recovery object.');
          return;
        }
        checkKeys(item, new Set(['condition', 'behavior', 'preserves']), path, errors);
        requireText(item.condition, path + '.condition', errors);
        requireText(item.behavior, path + '.behavior', errors);
      });
    }
  }

  if (contract.technical !== undefined) {
    if (!isObject(contract.technical)) addError(errors, '$.technical', 'type', 'Expected a technical object.');
    else {
      checkKeys(contract.technical, new Set(['owners', 'interfaces', 'data_flows', 'invariants', 'verification']), '$.technical', errors);
      const groups = [
        ['owners', ['concern', 'owner', 'source_of_truth']],
        ['interfaces', ['name', 'kind', 'contract']],
        ['data_flows', ['data', 'from', 'to', 'purpose']],
      ];
      for (const [key, required] of groups) {
        const value = contract.technical[key];
        if (value === undefined) continue;
        if (!Array.isArray(value)) {
          addError(errors, '$.technical.' + key, 'type', 'Expected an array.');
          continue;
        }
        value.forEach((item, index) => {
          if (!isObject(item)) {
            addError(errors, '$.technical.' + key + '[' + index + ']', 'type', 'Expected an object.');
            return;
          }
          required.forEach((field) => requireText(item[field], '$.technical.' + key + '[' + index + '].' + field, errors));
        });
      }
      checkStringArray(contract.technical.invariants, '$.technical.invariants', errors);
      checkStringArray(contract.technical.verification, '$.technical.verification', errors);
    }
  }
  return { valid: errors.length === 0, errors, warnings };
}

function cell(value = '') {
  return String(value).replaceAll('|', '\\|').replaceAll('\n', '<br>');
}

function diagramText(value = '') {
  return String(value).replaceAll('\\', '\\\\').replaceAll('"', '\\"').replaceAll('\n', ' ');
}

export function renderContract(contract) {
  const validation = validateContract(contract);
  if (!validation.valid) {
    const details = validation.errors.map((item) => '- ' + item.path + ': ' + item.message).join('\n');
    const error = new Error('Invalid flow contract:\n' + details);
    error.validation = validation;
    throw error;
  }
  const lines = [
    '# ' + contract.feature,
    '',
    '## Intent contract',
    '',
    '- **Actor:** ' + (contract.intent.actor || 'Not specified'),
    '- **Trigger:** ' + contract.intent.trigger,
  ];
  if (contract.intent.stated_means) lines.push('- **Stated means:** ' + contract.intent.stated_means);
  lines.push(
    '- **Desired change:** ' + contract.intent.desired_change,
    '- **Completion:** ' + contract.intent.completion,
    '- **Entry:** ' + contract.flow.entry,
    '- **Continuation:** ' + contract.flow.continuation,
  );
  if (contract.intent.constraints && contract.intent.constraints.length) lines.push('- **Constraints:** ' + contract.intent.constraints.join('; '));
  if (contract.intent.assumptions && contract.intent.assumptions.length) lines.push('- **Assumptions:** ' + contract.intent.assumptions.join('; '));

  lines.push('', '## Flow', '', '~~~mermaid', 'flowchart LR');
  for (const step of contract.flow.steps) lines.push('    ' + step.id + '["' + diagramText(step.action) + '"]');
  for (const step of contract.flow.steps) for (const next of step.next || []) lines.push('    ' + step.id + ' --> ' + next);
  lines.push('~~~', '', '| Step | Actor | Action | System effect | Feedback |', '|---|---|---|---|---|');
  for (const step of contract.flow.steps) lines.push('| ' + cell(step.id) + ' | ' + cell(step.actor) + ' | ' + cell(step.action) + ' | ' + cell(step.system_effect) + ' | ' + cell(step.feedback) + ' |');

  if (contract.flow.recovery && contract.flow.recovery.length) {
    lines.push('', '## Recovery', '', '| Condition | Behavior | Preserves |', '|---|---|---|');
    for (const item of contract.flow.recovery) lines.push('| ' + cell(item.condition) + ' | ' + cell(item.behavior) + ' | ' + cell(item.preserves) + ' |');
  }
  if (contract.technical && contract.technical.owners && contract.technical.owners.length) {
    lines.push('', '## Ownership', '', '| Concern | Owner | Source of truth |', '|---|---|---|');
    for (const item of contract.technical.owners) lines.push('| ' + cell(item.concern) + ' | ' + cell(item.owner) + ' | ' + cell(item.source_of_truth) + ' |');
  }
  if (contract.technical && contract.technical.interfaces && contract.technical.interfaces.length) {
    lines.push('', '## Interfaces', '', '| Name | Kind | Contract | Failure semantics |', '|---|---|---|---|');
    for (const item of contract.technical.interfaces) lines.push('| ' + cell(item.name) + ' | ' + cell(item.kind) + ' | ' + cell(item.contract) + ' | ' + cell(item.failure_semantics) + ' |');
  }
  if (contract.technical && contract.technical.data_flows && contract.technical.data_flows.length) {
    lines.push('', '## Data flow', '', '| Data | From | To | Purpose | Validation | Failure |', '|---|---|---|---|---|---|');
    for (const item of contract.technical.data_flows) lines.push('| ' + cell(item.data) + ' | ' + cell(item.from) + ' | ' + cell(item.to) + ' | ' + cell(item.purpose) + ' | ' + cell(item.validation) + ' | ' + cell(item.failure) + ' |');
  }
  if (contract.technical && contract.technical.invariants && contract.technical.invariants.length) lines.push('', '## Invariants', '', ...contract.technical.invariants.map((item) => '- ' + item));
  if (contract.technical && contract.technical.verification && contract.technical.verification.length) lines.push('', '## Verification', '', ...contract.technical.verification.map((item) => '- ' + item));
  return lines.join('\n') + '\n';
}

export async function readContract(path) {
  const absolute = resolve(path);
  if (!existsSync(absolute)) throw new Error('Contract does not exist: ' + absolute);
  try {
    return JSON.parse(await readFile(absolute, 'utf8'));
  } catch (error) {
    throw new Error('Cannot parse JSON contract ' + absolute + ': ' + error.message);
  }
}

async function main() {
  const [command = 'validate', path, ...args] = process.argv.slice(2);
  if (command === 'init') {
    process.stdout.write(JSON.stringify(createContract(path || 'Feature name'), null, 2) + '\n');
    return;
  }
  if (!path) throw new Error('Usage: flow-contract.mjs <init|validate|render> [contract.json|feature name] [--json]');
  const json = args.includes('--json');
  const contract = await readContract(path);
  if (command === 'validate') {
    const result = validateContract(contract);
    if (json) process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    else if (result.valid) process.stdout.write('✓ Valid flow contract' + (result.warnings.length ? ' (' + result.warnings.length + ' warnings)' : '') + '\n');
    else process.stdout.write(result.errors.map((item) => '✗ ' + item.path + ': ' + item.message).join('\n') + '\n');
    if (!result.valid) process.exitCode = 1;
  } else if (command === 'render') process.stdout.write(renderContract(contract));
  else throw new Error('Unknown command: ' + command + '. Choose init, validate, or render.');
}

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  main().catch((error) => {
    process.stderr.write('Error: ' + error.message + '\n');
    process.exitCode = 1;
  });
}
