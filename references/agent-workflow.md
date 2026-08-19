# Planning and coding workflow

Use this when an agent is writing a plan/spec or implementing a feature with meaningful user interaction. Decisions belong in the existing product/technical design and code workflow; this is not a detached design ceremony. For a PRD or architecture-sensitive feature, read [technical-design.md](technical-design.md) first.

## Calibrate effort

| Change | Expected treatment |
|---|---|
| Local synchronous action | Confirm entry, feedback, success, and likely error behavior inline |
| Form or multi-step task | Resolve required-now inputs, validation, preservation, and completion path |
| Background or durable work | Resolve authoritative status, stable identity, re-entry, interruption, retry/cancel semantics, and result discovery |
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

## Turn decisions into implementation steps

Plan vertical behavior, not isolated layers. Each step names a user-visible completion condition. For example:

1. Add authoritative job status and transition rules required by the user flow, with invariant tests.
2. Connect the existing empty-state entry to minimum input collection and job creation.
3. Render understandable status and safe actions from server state; restore them on refresh.
4. Close success and partial/failure paths with result, retry, and error-detail actions.
5. Connect the changed state or result to the continuation that completes the intended user outcome.

Adapt this shape to the repository. Avoid layer-only tasks that leave behavior unspecified between backend and frontend. Mark unsupported interactions as product or architecture decisions instead of faking them in the client.

## Coding rules

- Prefer existing state, routing, component, copy, and accessibility patterns. A state-machine library is not a default.
- Keep the server or durable domain model authoritative for work that outlives the page.
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
- partial success distinguishes completed and failed portions.

Prefer domain transition tests plus one or two critical integration/end-to-end journeys over snapshots of every label.
