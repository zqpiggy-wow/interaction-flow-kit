# Flow review

Use this to review a PRD, technical design, plan, prototype, or implementation. Inspect real behavior and system evidence when available. Do not replace evidence with a checklist, and do not require every possible artifact.

## Review approach

1. Identify the trigger, stated request, underlying job, downstream use, and observable completion.
2. Trace the current path through relevant entry surfaces, inputs, UI state, domain state, APIs/jobs, persistence, recovery, result surfaces, and the next action performed with the result.
   When durable data crosses stages, read [data-lineage.md](data-lineage.md) and trace the exact identity and fields rather than assuming that shared configuration means shared results.
   When the capability has been rewritten or patched across files, read [implementation-path.md](implementation-path.md) and trace every entry, state machine, side-effect trigger, worker/listener, adapter, fallback, and compatibility branch. Treat independently executable old/new paths as a P1 architecture defect.
3. Test the smallest set of realistic scenarios that can expose usability or consistency failures.
4. Report only material findings, highest impact first.

State evidence gaps. A screenshot cannot prove retry semantics; a component alone cannot prove discoverability or durable re-entry. When spec and implementation disagree, report the mismatch.

## Usability questions

Prioritize whether the feature is easy to use end to end:

- **Find:** Can the intended user discover the task where their intent arises? Are permission and empty-state behaviors coherent?
- **Understand:** Is the next action, consequence, current status, and waiting party clear in user language?
- **Act efficiently:** Does the flow reuse known context, apply safe defaults, defer optional inputs, and avoid redundant steps?
- **Stay oriented:** Are loading, empty, error, partial, and success states honest and locally connected to the affected task?
- **Recover:** Are valid inputs and completed work preserved? Are correction, retry, cancel, undo, or repair available only when meaningful?
- **Continue:** Can durable work be found after navigation, refresh, reconnect, or notification without duplicate submission?
- **Use the outcome:** Is operation success being mistaken for job completion? Does the changed state or result work in the intended next context and relevant later lifecycle?
- **Bind the outcome:** If a later stage depends on this result, can the user see which exact result is inherited or select a compatible one? Is independent operation explicit rather than an accidental fallback?
- **Access:** Do keyboard, focus, labels, announcements, readable status, and non-color cues follow project conventions?

Then check the system invariants required to deliver that usability:

- authoritative state is represented consistently across client, server, workers, and history;
- every durable object has one owning data boundary and single writer; no flow patches or mirrors another flow's internal state;
- cross-boundary data bindings are acyclic, or a separate orchestration boundary owns the feedback loop's coordination state, termination, idempotency, and recovery;
- all entries for one capability converge on one authoritative state machine and side-effect owner; no legacy reducer/store/job/listener/adapter can still advance or route the feature independently;
- retry and repeated submission do not duplicate side effects;
- timeout, stale response, concurrent edit, and cancellation semantics are coherent when applicable;
- inferred/defaulted consequential data can be inspected and corrected;
- sensitive, permissioned, or irreversible actions have appropriately timed safeguards;
- partial or downstream failure preserves useful results where feasible.

For a PRD or technical design, also check whether:

- every critical product promise maps to a plausible system capability, owner, and verification method;
- the feature boundary follows the underlying job rather than stopping at the literal requested control or generated output;
- current repository behavior, proposals, assumptions, and open decisions are distinguishable;
- architecture choices fit existing boundaries or justify the migration cost of changing them;
- data/state ownership, interface/event contracts, and failure semantics have one implementable interpretation;
- produced durable objects have a stable identity, authoritative store, useful projection or intentional internal purpose, and a defined consumer; cross-stage reads name request/response fields, binding mode, compatibility, provenance, and staleness;
- alternatives and trade-offs explain consequential choices without creating ceremonial option lists;
- compatibility, data migration, staged delivery, rollback, security/privacy, and observability are addressed in proportion to risk;
- the plan can ship in coherent vertical slices and tests prove both the user outcome and the riskiest technical assumption.

Do not demand branches or controls the product cannot encounter or the backend cannot support.

## Priorities

| Priority | Meaning | Examples |
|---|---|---|
| P0 | Unsafe, destructive, or unauthorized | unrecoverable loss, unauthorized action, false critical success |
| P1 | Blocks or seriously compromises the user job or safe implementation | no entry, dead end, lost work, duplicate side effect, unreachable result, two live state machines for one capability, ambiguous source of truth or unsafe migration |
| P2 | Creates substantial confusion, effort, avoidable error, or implementation divergence | redundant required fields, unclear running state, missing safe recovery, underspecified boundary/failure contract |
| P3 | Local friction with limited impact | minor extra step, inconsistent secondary feedback |

Severity reflects user/system impact, not implementation effort. Do not inflate findings or invent issues to fill categories.

## Actionable finding format

For each finding give:

- **Evidence:** exact flow step, observed behavior, route, component, or file/line.
- **Impact:** who fails to do what or which system invariant becomes unsafe/ambiguous, under which condition.
- **Fix:** the smallest coherent behavior change; do not prescribe styling for a state or ownership problem.
- **Acceptance:** observable proof across the relevant path, including recovery or continuity when central to the issue.

Group symptoms with one root cause. Treat claims that depend on unavailable evidence as validation questions, not confirmed defects. If there are no material findings, say so and name remaining test gaps.

## Output

Lead with findings. Add a compact corrected Flow Contract or implementation sequence only when it helps resolve them. Do not dump the reconstructed flow, matrices, or diagrams unless the user requests them or they are necessary to make the fix unambiguous.
