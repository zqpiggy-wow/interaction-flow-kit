---
name: interaction-flow-kit
description: Design or review user-facing product changes from the real job behind a request through a usable outcome and implementation contract. Use for PRDs, feature specs, implementation plans, architecture-sensitive product work, and flow reviews where entry, state ownership, recovery, downstream use, or verification may otherwise be missed.
---

# Interaction Flow Kit

Turn the requested capability into a complete, usable outcome rather than implementing the request noun in isolation. Optimize first for whether a user can discover, understand, complete, recover from, and benefit from the change. Then make the technical design explicit enough to implement that behavior honestly. Prevent PRDs from promising unsupported behavior and code from shipping a capability with no usable entry, feedback, recovery, or continuation.

## Default behavior

Before planning a user-facing change, inspect the relevant product and code paths. Treat the user's wording as evidence of intent, not automatically as the complete solution. Infer what they are trying to accomplish before choosing controls or boundaries, then resolve the minimum interaction contract and carry it into the plan, code, and tests. Keep the contract inline and concise; do not create standalone artifacts unless requested or the behavior is too ambiguous without one.

Use this compact **Flow Contract** as a thinking frame, not a mandatory template:

- **Intent and usable outcome** — the triggering situation, desired change, and observable evidence that the user's job is complete.
- **Before and after** — what the user already has, what the capability changes or produces, and how that changed state participates in the rest of the job.
- **Entry and return** — how the task is discovered, started, and found again.
- **Minimum input** — what is known or inferable and what must actually be asked now.
- **Critical path** — the shortest understandable path to the result.
- **Feedback and control** — what the user sees and may do while work proceeds.
- **Recovery** — likely validation, failure, cancellation, interruption, and partial-result behavior.
- **Open decisions** — only unresolved choices that materially change implementation.

Omit irrelevant items. A small synchronous action may need one sentence; durable background work needs more.

Do not implement the request noun or proposed control in isolation. Trace **trigger -> desired change -> requested means -> changed state/result -> continuation -> completed job**. Apply the counterfactual test: *if the named capability worked exactly as requested, could the user still fail to accomplish the likely job?* If yes, find the missing boundary before designing the interface. This applies to any capability—creating, finding, editing, generating, moving, sharing, automating, deciding, or removing—not only flows that produce files. If context supports one dominant intent, design for it and state the assumption. Ask one focused question only when plausible intents would materially change scope, safety, or architecture. Read [references/intent-and-closure.md](references/intent-and-closure.md) when purpose, lifecycle, or continuation is implicit.

When the requested deliverable is a PRD or design specification, the document itself is the useful artifact. Include a proportional **Technical Design Contract** in it or as a clearly linked companion section:

- **Current system and constraints** — evidence from the repository, dependencies, limits, and behavior that must remain compatible.
- **Chosen design and rationale** — the approach, meaningful alternatives considered, and why the choice fits the user and system requirements.
- **Ownership and contracts** — components/services, source of truth, data lifecycle, states, APIs/events, permissions, and failure semantics.
- **Delivery and proof** — migration, rollout/rollback, observability, tests, acceptance criteria, and unresolved risks.

Do not invent low-level details that repository evidence cannot support. Label confirmed behavior, proposed behavior, assumptions, and open decisions. Read [references/technical-design.md](references/technical-design.md) whenever creating a PRD or when the user asks for product, system, architecture, API, data, or rollout design.

## Agent loop

1. **Inspect before inventing.** Find existing routes, entry surfaces, domain state, APIs, jobs, persistence, permissions, notifications, tests, and project conventions relevant to the change.
2. **Design before committing.** Resolve the underlying job, downstream use, user flow, and technical contracts needed to deliver it. Compare alternatives only where the choice changes usability, reliability, cost, risk, or reversibility.
3. **Record decisions in the PRD/plan/spec.** Put interaction and technical decisions, rationale, and acceptance criteria where the coding Agent will consume them. Do not add a separate diagram step unless a diagram is genuinely useful.
4. **Implement vertical slices.** Each slice connects a real entry through authoritative system behavior to an observable outcome. Reuse current architecture; introduce a new abstraction only when its benefit and migration cost are justified.
5. **Keep behavior honest.** The interface reflects authoritative state. Do not promise progress, pause, cancel, retry, or resume unless the underlying system supports clear semantics.
6. **Verify the design and journey.** Check technical invariants and exercise the main path plus plausible interruption or failure paths. Confirm the result remains discoverable and actionable.
7. **Report compactly.** Summarize completed behavior, technical decisions, verification, and remaining product decisions. Do not dump intermediate analysis into the handoff.

Read [references/agent-workflow.md](references/agent-workflow.md) when planning or implementing a non-trivial feature. Read [references/review.md](references/review.md) when reviewing an existing flow or design. Read [references/artifacts.md](references/artifacts.md) only when a diagram or structured table materially clarifies the work or the user requests one.

When durable data crosses steps, stages, sessions, actors, or services, read [references/data-lineage.md](references/data-lineage.md). Distinguish the operation/task identity from the produced result or dataset identity. Resolve the producer, source of truth, user-visible projection, downstream consumer, boundary fields, binding mode, compatibility, provenance, and staleness behavior. A multi-stage design is not implementation-ready while any stage must invent which upstream result it consumes, how it selects or inherits it, or which fields cross the boundary. Do not create a lineage artifact for flows without a meaningful durable handoff.

## Executable tools

Use the bundled tools when deterministic evidence or a machine-checkable handoff improves the task. They are optional for simple work:

- Run `node scripts/inspect-repository.mjs --root <repo> --query "<feature terms>" --json` before architecture-sensitive design when repository structure is unfamiliar. Treat its file/line matches as evidence candidates; inspect relevant files before making claims.
- For a complex, durable, or cross-boundary flow, run `node scripts/flow-contract.mjs init "<feature>"` to create an editable JSON contract, `validate <file>` to check required intent/flow semantics and graph references, and `render <file>` to generate reviewable Markdown, Mermaid, ownership, interface, recovery, and data-flow tables.

When the package CLI is available, prefer the equivalent `ifk inspect` and `ifk contract init|validate|render` commands. Do not create a JSON contract merely to satisfy the skill; keep decisions inline when prose is sufficient. Never treat scanner matches or a valid schema as proof that the product design is correct.

## Usability invariants

- **Discoverable:** put the primary action where intent naturally occurs. Empty states and results should expose the relevant next action.
- **Low effort:** never ask again for trustworthy known information. Infer or default only when safe; expose consequential assumptions for correction. Defer optional and branch-specific inputs.
- **Clear:** use the user's vocabulary. At each step make the next action, consequence, and current status understandable. Avoid exposing internal system stages that do not help a decision.
- **Responsive:** acknowledge actions promptly, prevent accidental duplicate submission, and show determinate progress only when it is real.
- **Forgiving:** preserve valid input and completed work across recoverable errors. Put confirmation near irreversible actions; prefer undo or repair for reversible ones.
- **Continuous:** work that survives navigation has a stable identity and re-entry surface. Refresh or reconnect must reconcile with authoritative state.
- **Controllable:** offer cancel, retry, edit, resume, or inspect only when the system can honor them safely. Explain unavailable actions.
- **Outcome-oriented:** success reveals the result and next useful action. Failure and partial success explain what happened, what was preserved, and how to continue.
- **Closed-loop:** operation success is not automatically job success. Cover the relevant continuation and lifecycle or explicitly bound the feature and its handoff; do not add adjacent features merely for symmetry.
- **Accessible:** preserve keyboard, focus, labels, readable status, and non-color cues using the project's accessibility conventions.

Represent only meaningful domain states. Avoid both a single ambiguous `isLoading` and an exhaustive state model with no product consequence. For long work, distinguish only states that change feedback, control, ownership, persistence, or result availability.

Ask the user only when an unresolved decision materially changes product behavior and cannot be answered from repository evidence.

## Technical design invariants

- Trace each important product promise and downstream outcome to a system capability, owner, and verification method.
- Prefer the smallest design that fits existing architecture and preserves a clean evolution path; do not confuse novelty with quality.
- Make sources of truth, data ownership, state transitions, boundary contracts, and failure behavior explicit where ambiguity would make implementations diverge.
- For cross-stage durable data, make each meaningful node's reads/writes and each handoff's identity, storage/entity, API fields, user projection, consumer, binding, compatibility, provenance, and invalidation behavior explicit.
- Treat compatibility, migration, rollout, rollback, observability, security/privacy, concurrency, and idempotency as design inputs when applicable—not cleanup after coding.
- Separate requirements from proposed implementation. A PRD may constrain observable behavior without prematurely freezing replaceable internals.
- Record trade-offs and rejected options only when they explain a consequential decision.
- A design is not implementation-ready while a coding Agent must invent user behavior, state ownership, irreversible data changes, failure semantics, or rollout safety.

## Review behavior

When asked to review, reconstruct the current flow from the intent trigger through downstream use, not merely to the first success message. Lead with prioritized findings. Each finding identifies observed behavior, user impact, the smallest coherent fix, and observable acceptance criteria. Do not implement fixes unless requested.
