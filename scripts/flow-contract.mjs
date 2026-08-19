#!/usr/bin/env node

import { existsSync, realpathSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

const ID_PATTERN = /^[A-Za-z][A-Za-z0-9_-]*$/;
const DATA_KINDS = new Set(['operation', 'result', 'dataset', 'record', 'configuration', 'artifact']);
const BINDING_MODES = new Set(['inherit-current', 'select-compatible', 'optional', 'independent']);
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
          reads: [],
          writes: [],
        },
        {
          id: 'complete',
          actor: 'Primary user',
          action: 'Use the result',
          system_effect: 'Expose the changed state or result',
          feedback: 'Show completion and the next useful action',
          next: [],
          reads: [],
          writes: [],
        },
      ],
      continuation: 'How the changed state or result completes the job',
      recovery: [],
    },
    technical: {
      owners: [],
      interfaces: [],
      data_flows: [],
      data_objects: [],
      data_bindings: [],
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
        checkKeys(step, new Set(['id', 'actor', 'action', 'system_effect', 'feedback', 'next', 'reads', 'writes']), path, errors);
        requireText(step.id, path + '.id', errors);
        requireText(step.action, path + '.action', errors);
        if (isText(step.id) && !ID_PATTERN.test(step.id)) addError(errors, path + '.id', 'id-format', 'Use letters, digits, _ or -, starting with a letter.');
        if (isText(step.id) && ids.has(step.id)) addError(errors, path + '.id', 'duplicate-id', 'Duplicate step id; first used at index ' + ids.get(step.id) + '.');
        if (isText(step.id)) ids.set(step.id, index);
        checkStringArray(step.next, path + '.next', errors);
        checkStringArray(step.reads, path + '.reads', errors);
        checkStringArray(step.writes, path + '.writes', errors);
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
      checkKeys(contract.technical, new Set(['owners', 'interfaces', 'data_flows', 'data_objects', 'data_bindings', 'invariants', 'verification']), '$.technical', errors);
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

      const steps = Array.isArray(contract.flow && contract.flow.steps) ? contract.flow.steps : [];
      const stepIds = new Set(steps.filter(isObject).map((step) => step.id).filter(isText));
      const dataObjects = contract.technical.data_objects;
      const objectIds = new Map();
      if (dataObjects !== undefined) {
        if (!Array.isArray(dataObjects)) addError(errors, '$.technical.data_objects', 'type', 'Expected an array.');
        else dataObjects.forEach((item, index) => {
          const path = '$.technical.data_objects[' + index + ']';
          if (!isObject(item)) {
            addError(errors, path, 'type', 'Expected an object.');
            return;
          }
          checkKeys(item, new Set(['id', 'kind', 'identity', 'produced_by', 'external_source', 'owner', 'source_of_truth', 'user_projection', 'internal_purpose', 'lifecycle']), path, errors);
          for (const field of ['id', 'kind', 'identity', 'owner', 'source_of_truth']) requireText(item[field], path + '.' + field, errors);
          if (isText(item.kind) && !DATA_KINDS.has(item.kind)) addError(errors, path + '.kind', 'enum', 'Choose operation, result, dataset, record, configuration, or artifact.');
          if (isText(item.id) && !ID_PATTERN.test(item.id)) addError(errors, path + '.id', 'id-format', 'Use letters, digits, _ or -, starting with a letter.');
          if (isText(item.id) && objectIds.has(item.id)) addError(errors, path + '.id', 'duplicate-id', 'Duplicate data object id; first used at index ' + objectIds.get(item.id) + '.');
          if (isText(item.id)) objectIds.set(item.id, index);
          if (isText(item.produced_by) && isText(item.external_source)) addError(errors, path, 'ambiguous-source', 'Choose produced_by or external_source, not both.');
          if (isText(item.produced_by) && !stepIds.has(item.produced_by)) addError(errors, path + '.produced_by', 'unknown-step', 'Unknown producer step: ' + item.produced_by + '.');
          if (!isText(item.produced_by) && !isText(item.external_source)) addError(errors, path, 'missing-source', 'Specify produced_by or external_source.');
        });
      }

      for (const [stepIndex, step] of steps.entries()) {
        if (!isObject(step)) continue;
        for (const field of ['reads', 'writes']) {
          if (!Array.isArray(step[field])) continue;
          for (const objectId of step[field]) {
            if (isText(objectId) && !objectIds.has(objectId)) addError(errors, '$.flow.steps[' + stepIndex + '].' + field, 'unknown-data-object', 'Unknown data object: ' + objectId + '.');
          }
        }
      }

      const bindings = contract.technical.data_bindings;
      const consumed = new Set();
      if (bindings !== undefined) {
        if (!Array.isArray(bindings)) addError(errors, '$.technical.data_bindings', 'type', 'Expected an array.');
        else bindings.forEach((item, index) => {
          const path = '$.technical.data_bindings[' + index + ']';
          if (!isObject(item)) {
            addError(errors, path, 'type', 'Expected an object.');
            return;
          }
          checkKeys(item, new Set(['from_step', 'to_step', 'data_object', 'binding', 'request_fields', 'response_fields', 'selection_query', 'compatibility', 'provenance', 'correction', 'staleness', 'empty_behavior']), path, errors);
          for (const field of ['from_step', 'to_step', 'binding']) requireText(item[field], path + '.' + field, errors);
          if (isText(item.binding) && !BINDING_MODES.has(item.binding)) addError(errors, path + '.binding', 'enum', 'Choose inherit-current, select-compatible, optional, or independent.');
          checkStringArray(item.request_fields, path + '.request_fields', errors);
          checkStringArray(item.response_fields, path + '.response_fields', errors);
          checkStringArray(item.compatibility, path + '.compatibility', errors);
          if (isText(item.from_step) && !stepIds.has(item.from_step)) addError(errors, path + '.from_step', 'unknown-step', 'Unknown source step: ' + item.from_step + '.');
          if (isText(item.to_step) && !stepIds.has(item.to_step)) addError(errors, path + '.to_step', 'unknown-step', 'Unknown destination step: ' + item.to_step + '.');
          const independent = item.binding === 'independent';
          if (independent && isText(item.data_object)) addError(errors, path + '.data_object', 'independent-data', 'Independent stages must not claim an upstream data object.');
          if (!independent && !isText(item.data_object)) addError(errors, path + '.data_object', 'missing-data-object', 'A dependent binding must name the upstream data object.');
          if (isText(item.data_object) && !objectIds.has(item.data_object)) addError(errors, path + '.data_object', 'unknown-data-object', 'Unknown data object: ' + item.data_object + '.');
          if (isText(item.data_object)) consumed.add(item.data_object);
          if (isText(item.data_object) && objectIds.has(item.data_object)) {
            const dataObject = dataObjects[objectIds.get(item.data_object)];
            if (isText(dataObject.produced_by) && isText(item.from_step) && dataObject.produced_by !== item.from_step) addError(errors, path + '.from_step', 'producer-mismatch', 'Binding source must match the data object producer ' + dataObject.produced_by + '.');
            if (dataObject.kind === 'operation' && !independent) warnings.push({ path: path + '.data_object', code: 'operation-as-result', message: 'This binding consumes an operation identity. Confirm that downstream needs execution metadata rather than a produced result or dataset.' });
            if (item.binding === 'select-compatible' && !isText(dataObject.user_projection)) addError(errors, path + '.data_object', 'uninspectable-selection', 'Selectable results need a user projection that distinguishes candidates.');
          }
          if (!independent && (!Array.isArray(item.request_fields) || !item.request_fields.length)) addError(errors, path + '.request_fields', 'missing-request-fields', 'Specify the field or fields that carry the upstream identity or data.');
          if (item.binding === 'select-compatible') {
            if (!isText(item.selection_query)) addError(errors, path + '.selection_query', 'missing-selection-query', 'Selection requires a compatible-result query/filter contract.');
            if (!Array.isArray(item.compatibility) || !item.compatibility.length) addError(errors, path + '.compatibility', 'missing-compatibility', 'Selection requires at least one compatibility rule.');
            if (!isText(item.empty_behavior)) addError(errors, path + '.empty_behavior', 'missing-empty-behavior', 'Selection requires behavior for no compatible results.');
          }
          if (item.binding === 'inherit-current') {
            if (!isText(item.provenance)) addError(errors, path + '.provenance', 'missing-provenance', 'Automatic inheritance must show or record the chosen source.');
            if (!isText(item.correction)) addError(errors, path + '.correction', 'missing-correction', 'Automatic inheritance needs a correction or change path.');
          }
          if (!independent && !isText(item.provenance)) warnings.push({ path: path + '.provenance', code: 'missing-provenance', message: 'Persist or expose which exact upstream result was consumed.' });
          if (!independent && !isText(item.staleness)) warnings.push({ path: path + '.staleness', code: 'missing-staleness', message: 'Define what happens when the upstream result changes, expires, or is replaced.' });
        });
      }

      if (Array.isArray(dataObjects)) dataObjects.forEach((item, index) => {
        if (!isObject(item) || !isText(item.id)) return;
        const produced = isText(item.produced_by);
        if (produced && !isText(item.user_projection) && !isText(item.internal_purpose) && !consumed.has(item.id)) {
          addError(errors, '$.technical.data_objects[' + index + ']', 'unusable-result', 'A produced object needs a user projection, downstream binding, or explicit internal purpose.');
        }
        if (produced && stepIds.has(item.produced_by)) {
          const producer = steps.find((step) => isObject(step) && step.id === item.produced_by);
          if (!Array.isArray(producer.writes) || !producer.writes.includes(item.id)) addError(errors, '$.technical.data_objects[' + index + '].produced_by', 'missing-producer-write', 'Producer step ' + item.produced_by + ' must list ' + item.id + ' in writes.');
        }
      });

      for (const [stepIndex, step] of steps.entries()) {
        if (!isObject(step) || !Array.isArray(step.reads)) continue;
        for (const objectId of step.reads) {
          if (!objectIds.has(objectId)) continue;
          const dataObject = dataObjects[objectIds.get(objectId)];
          if (!isText(dataObject.produced_by) || dataObject.produced_by === step.id) continue;
          const linked = Array.isArray(bindings) && bindings.some((binding) => isObject(binding) && binding.to_step === step.id && binding.data_object === objectId && binding.binding !== 'independent');
          if (!linked) addError(errors, '$.flow.steps[' + stepIndex + '].reads', 'missing-data-binding', 'Cross-stage read of ' + objectId + ' requires an explicit data binding.');
        }
      }
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
  const hasStepData = contract.flow.steps.some((step) => (step.reads && step.reads.length) || (step.writes && step.writes.length));
  if (hasStepData) {
    lines.push('~~~', '', '| Step | Actor | Action | Reads | Writes | System effect | Feedback |', '|---|---|---|---|---|---|---|');
    for (const step of contract.flow.steps) lines.push('| ' + cell(step.id) + ' | ' + cell(step.actor) + ' | ' + cell(step.action) + ' | ' + cell((step.reads || []).join(', ')) + ' | ' + cell((step.writes || []).join(', ')) + ' | ' + cell(step.system_effect) + ' | ' + cell(step.feedback) + ' |');
  } else {
    lines.push('~~~', '', '| Step | Actor | Action | System effect | Feedback |', '|---|---|---|---|---|');
    for (const step of contract.flow.steps) lines.push('| ' + cell(step.id) + ' | ' + cell(step.actor) + ' | ' + cell(step.action) + ' | ' + cell(step.system_effect) + ' | ' + cell(step.feedback) + ' |');
  }

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
  if (contract.technical && contract.technical.data_objects && contract.technical.data_objects.length) {
    lines.push('', '## Data objects', '', '| Object | Kind | Identity | Producer/source | Owner | Source of truth | User projection/internal purpose | Lifecycle |', '|---|---|---|---|---|---|---|---|');
    for (const item of contract.technical.data_objects) lines.push('| ' + cell(item.id) + ' | ' + cell(item.kind) + ' | ' + cell(item.identity) + ' | ' + cell(item.produced_by || item.external_source) + ' | ' + cell(item.owner) + ' | ' + cell(item.source_of_truth) + ' | ' + cell(item.user_projection || item.internal_purpose) + ' | ' + cell(item.lifecycle) + ' |');
  }
  if (contract.technical && contract.technical.data_bindings && contract.technical.data_bindings.length) {
    lines.push('', '## Stage data lineage', '', '| From -> to | Data object | Binding | Request fields | Response fields | Selection/compatibility | Provenance/correction | Staleness/empty behavior |', '|---|---|---|---|---|---|---|---|');
    for (const item of contract.technical.data_bindings) lines.push('| ' + cell(item.from_step + ' -> ' + item.to_step) + ' | ' + cell(item.data_object || 'None') + ' | ' + cell(item.binding) + ' | ' + cell((item.request_fields || []).join(', ')) + ' | ' + cell((item.response_fields || []).join(', ')) + ' | ' + cell([item.selection_query, ...(item.compatibility || [])].filter(Boolean).join('; ')) + ' | ' + cell([item.provenance, item.correction].filter(Boolean).join('; ')) + ' | ' + cell([item.staleness, item.empty_behavior].filter(Boolean).join('; ')) + ' |');
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
