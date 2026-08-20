# Planning and coding workflow

Use this when an agent is writing a plan/spec or implementing a feature with meaningful user interaction. Decisions belong in the existing product/technical design and code workflow; this is not a detached design ceremony. For a PRD or architecture-sensitive feature, read [technical-design.md](technical-design.md) first.

When modifying an existing capability across multiple files or turns, read [implementation-path.md](implementation-path.md) before editing. Establish the authoritative path and decide whether to evolve it or replace it; do not accumulate a parallel state machine through patches.

## Calibrate effort

| Change | Expected treatment |
|---|---|
| Local synchronous action | Confirm entry, feedback, success, and likely error behavior inline |
| Form or multi-step task | Resolve required-now inputs, validation, preservation, and completion path |
| Background or durable work | Resolve authoritative status, stable identity, re-entry, interruption, retry/cancel semantics, and result discovery |
| Cross-stage durable data | Resolve each flow's data boundary, single-writer ownership, operation versus result identity, reads/writes, storage, downstream binding, compatibility, provenance, staleness, and dependency direction |
| Cross-system, approval, or destructive flow | Resolve ownership, confirmation, timeout, idempotency, auditability, and compensation before coding |

Do not expand a simple feature into a workflow platform. Do not compress a durable asynchronous task into a button plus spinner.

## Inspect what constrains the experience

Inspect only surfaces that answer implementation decisions:

- navigation, contextual actions, empty states, and result/history surfaces;
- domain types, status fields, persisted identifiers, and state ownership;
- request/response/event contracts and background execution;
- refresh, reconnect, polling/subscription, and cache reconciliation;
- permission, confirmation, and destructive-action patterns;
- existing loading, error, notification, accessibility, and test conventions.
- all existing entry points, state reducers/stores, commands/use cases, workers/listeners, side-effect triggers, compatibility shims/adapters, feature flags, and tests for the same capability.

Existing behavior is evidence, not automatically the desired behavior. Surface contradictions between the request, current product, and backend capability.

## Resolve the minimum Flow Contract

Write decisions directly into the plan/spec. A compact example is enough:

```text
Flow: Start import from dataset empty state -> validate file -> create durable job -> show job detail -> open imported dataset.
Inputs: Dataset is known; file is required now; mapping is asked only if headers cannot be inferred.
Feedback/control: Preserve chosen file during validation; job detail shows authoritative phase; leaving is safe; cancel is available before commit.
Recovery: Keep mapping; retry failed rows without re-importing successful rows.
Result: Job detail links to the dataset and downloadable error rows; running and completed jobs remain in import history.
```

This illustrates useful density, not a required format. Do not list every theoretical state or edge case. Include behavior only if it changes effort, understanding, control, persistence, or the outcome.

Before accepting a named feature as the boundary, trace its outcome chain and apply the counterfactual completion test: if the requested capability works exactly as stated, can the user still fail to finish the likely job? Read [intent-and-closure.md](intent-and-closure.md) when the trigger, desired change, lifecycle, or continuation is implicit. Put the inferred intent in the plan so implementation does not silently collapse it back to the literal control.

### Minimize interaction cost

For each requested input, decide at the point it is used:

- **Known** — use trustworthy context; do not ask again.
- **Inferable/defaultable** — use when safe and reversible; expose before a consequential commit.
- **Required now** — ask because it blocks the next necessary step.
- **Required later** — defer until its branch needs it.
- **Optional** — keep out of the critical path.

Prefer progressive disclosure. Keep advanced configuration behind a clear optional path and preserve the user's place when validation fails. Record provenance or confidence only when it changes trust or correction behavior.

### Model feedback, state, and control

Use domain states already supported by the system. Add or split state only when the user must see different feedback or controls. For each meaningful non-terminal state, resolve:

- authoritative owner and persistence;
- what the user understands and may do;
- what exits the state;
- refresh and re-entry behavior;
- timeout, retry, cancellation, or cleanup semantics where applicable.

If progress cannot be measured, show phase or liveness rather than invented percentages. For asynchronous work distinguish a cancellation request from confirmed cancellation when that difference affects behavior.

### Close cross-stage data handoffs

When one node produces durable data that another node is expected to use, read [data-lineage.md](data-lineage.md). Do not stop at shared configuration or a completed task status. Name the produced result/dataset, its stable identity and source of truth, what the user can inspect, and which request/response/event fields bind it downstream. Choose one explicit relationship: inherit current, select compatible, optional, or independent. For selection, define compatible-result discovery and empty behavior; for inheritance, show provenance and a correction path. Persist the selected source and define compatibility and stale propagation.

Assign every data-producing or data-consuming step to a flow/module data boundary. One boundary writes each durable object; consumers retain only their own binding, provenance, and derived state. Do not synchronize status fields across modules or let two flows produce inputs that recursively drive each other's state machines. Cross-boundary bindings should form a directed acyclic graph. If feedback is genuinely part of the domain, introduce a separate orchestration boundary that owns coordination state, sequencing, convergence/termination, retry, and recovery.

If the later node has no data dependency, do not imply a sequential pipeline merely because the screens are numbered.

## Turn decisions into implementation steps

Plan vertical behavior, not isolated layers. Each step names a user-visible completion condition. For example:

1. Add authoritative job status and transition rules required by the user flow, with invariant tests.
2. Connect the existing empty-state entry to minimum input collection and job creation.
3. Render understandable status and safe actions from server state; restore them on refresh.
4. Close success and partial/failure paths with result, retry, and error-detail actions.
5. Connect the changed state or result to the continuation that completes the intended user outcome.
6. For a cross-stage result, prove that the downstream execution records the exact source identity and that the user can inspect or correct that binding.

Adapt this shape to the repository. Avoid layer-only tasks that leave behavior unspecified between backend and frontend. Mark unsupported interactions as product or architecture decisions instead of faking them in the client.

## Coding rules

- Prefer existing state, routing, component, copy, and accessibility patterns. A state-machine library is not a default.
- Keep the server or durable domain model authoritative for work that outlives the page.
- Keep each flow's durable data inside its owning boundary; use public contracts for cross-boundary reads and commands, never direct table/state mutation or mirrored status.
- Route every entry for one capability directly into one authoritative command/use case and state machine. Do not retain compatibility adapters, fallback routes, or alternate handlers.
- After replacing a path, remove its routes, adapters, state transitions, listeners/workers, side-effect calls, flags, and tests in the same change. If duplicate status enums, stores, jobs, direct side-effect calls, or independently passing old/new tests are found, stop local patching and consolidate ownership first.
- Give side-effecting submissions stable identity and deduplication/idempotency when repeat delivery is plausible.
- Preserve valid input on correction and recoverable failure; focus the first actionable error.
- Reconcile stale responses and duplicate tabs when the feature can encounter them.
- Make unavailable actions absent or explain why they are disabled; do not show fictional controls.
- Avoid layout shifts and ambiguous global spinners when local feedback identifies the affected operation better.
- Make empty, loading, error, partial, and success behavior part of implementation—not polish deferred to the end.

## Verification

Test applicable scenarios, emphasizing usability and continuity:

- the intended user can discover and start the task;
- the task asks only for necessary information and makes defaults correctable;
- the next action, consequence, and status are understandable without internal knowledge;
- keyboard, focus, accessible naming, and non-color feedback follow project conventions;
- the main path exposes the promised result and next action;
- the changed state or result supports the intended continuation and applicable later lifecycle;
- validation and recoverable failure preserve useful work;
- refresh/navigation reconstructs durable work without duplicate submission;
- retry/cancel agrees across interface and authoritative state;
- every supported entry reaches the same authoritative state machine and side-effect owner, and negative repository searches find no unintended legacy execution path;
- partial success distinguishes completed and failed portions.

Prefer domain transition tests plus one or two critical integration/end-to-end journeys over snapshots of every label.
