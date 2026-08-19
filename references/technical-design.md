# PRD and technical design

Use this reference when producing a PRD, RFC, design specification, architecture proposal, or implementation plan whose technical decisions matter. Product and technical design should inform each other: the product flow defines the behavior to preserve, and the technical design proves that behavior can be delivered and operated.

## Design process

### 1. Establish evidence and decision scope

Inspect the existing repository and relevant system contracts before proposing an architecture. Locate only what can change the design:

- current entry/result surfaces and product conventions;
- domain objects, schemas, state ownership, and persistence;
- service/module boundaries and dependency direction;
- APIs, commands, events, queues, workers, schedulers, and external systems;
- identity, permissions, tenancy, privacy, and audit boundaries;
- operational limits, performance characteristics, deployment topology, and observability;
- migration practices, compatibility commitments, feature flags, and test seams.

State the evidence inspected. Separate **confirmed current behavior**, **proposed behavior**, **assumptions**, and **open decisions**. Do not present a guessed schema or API as an existing contract.

Define which decisions the document must settle and which can safely remain implementation details. A PRD should constrain observable behavior and critical system invariants without freezing replaceable internals prematurely.

### 2. Join product requirements to technical implications

For each consequential user promise, including the lifecycle and continuation needed to complete the underlying job, identify the capability it requires. Examples:

| Product promise | Technical implication to resolve |
|---|---|
| Work survives navigation | Stable resource/job identity, durable source of truth, rehydration contract |
| Safe retry | Idempotency boundary, deduplication identity, preserved input/result |
| Cancel | Cancellation ownership, commit point, compensation, confirmed terminal state |
| Partial result | Per-item outcome model, result retention, aggregate status semantics |
| Real progress | Measurable units/phases and authoritative progress publication |
| Human approval | Approval state, actor/permission model, expiry, rejection and audit events |
| Immediate discoverability | Route/action ownership, permissions, empty-state and navigation integration |
| Result crosses a product or actor boundary | Stable representation/identity, permission and redaction policy, compatible receiving contract |
| User can modify and re-apply a result | Validation and error localization, version compatibility, conflict and rollback semantics |

If the system cannot support a promise, change the proposed behavior or make the missing capability an explicit prerequisite. Do not simulate unsupported guarantees in the client.

### 3. Explore meaningful alternatives

Generate alternatives only for decisions with real consequences. Compare them using the constraints that matter here, such as:

- usability and correctness;
- fit with existing architecture and team operation;
- delivery complexity and time;
- reliability, failure isolation, and recoverability;
- consistency, latency, throughput, and cost;
- security/privacy and permission boundaries;
- migration and rollback risk;
- future evolution and lock-in.

Choose an approach and state why. A useful decision record can be one paragraph. Do not create artificial option tables for obvious choices, and do not hide a consequential trade-off behind “industry best practice.”

Use a small spike or inspect a dependency's primary documentation when feasibility is uncertain. Record what was proven and what remains uncertain; a spike is evidence, not production implementation.

### 4. Define the minimum Technical Design Contract

Include only applicable sections, but resolve any item whose ambiguity could cause incompatible implementations.

#### Architecture and ownership

- affected components/services and their responsibilities;
- source of truth for each durable state and important datum;
- dependency direction and synchronous/asynchronous boundaries;
- which existing seams are reused and which new seam is justified.

#### Data and lifecycle

- domain entities, identifiers, relationships, and invariant fields;
- create/read/update/delete or append-only lifecycle;
- schema/API versioning and backward/forward compatibility;
- retention, deletion, privacy classification, and audit requirements;
- migration/backfill strategy and behavior during mixed versions.

Do not enumerate fields already defined by an authoritative schema unless the proposal changes them. Focus on new semantics and invariants.

#### Interfaces, events, and state

- semantic request/response, command/event, or callback contracts;
- validation ownership and structured failure categories;
- state transitions that affect behavior or integration;
- ordering, duplication, concurrency, timeout, retry, and idempotency rules;
- external dependency degradation and compensation behavior.

Use examples or schemas when precision is needed, but avoid generating exhaustive payloads before the domain semantics are settled.

#### Security and trust

- authentication, authorization, tenancy, and least-privilege boundaries;
- sensitive data exposure, encryption, secrets, consent, and audit trail;
- abuse, quota, destructive action, or untrusted-input risks applicable to the feature.

#### Operability

- success and service-level signals tied to the user outcome;
- logs, metrics, traces, and audit events needed to diagnose state transitions;
- alerts and operational recovery for credible failure modes;
- cost/capacity assumptions and limits worth validating.

### 5. Design delivery, not just steady state

Specify the safe path from current to target behavior:

- implementation slices that each preserve a coherent product state;
- dependency and data migration order;
- feature flag, shadow/dual-read/write, canary, or staged rollout when justified;
- compatibility window for old clients/workers/data;
- rollback trigger and what rollback can/cannot reverse;
- cleanup of temporary paths and the condition for completing migration.

Do not prescribe elaborate deployment machinery for a low-risk local change. For irreversible data changes or external side effects, rollout and rollback semantics are required.

### 6. Prove readiness

Connect verification to requirements and risks:

- domain invariant and transition tests;
- contract/integration tests at changed boundaries;
- one or more critical end-to-end user journeys;
- migration, mixed-version, retry/duplicate, permission, and failure-injection tests when relevant;
- performance/capacity checks tied to an explicit assumption;
- post-deploy signals and acceptance thresholds.

A test list that does not prove the main user outcome or the risky technical decision is insufficient.

## PRD shape

Adapt the document to the organization, but a strong implementation-oriented PRD usually makes these decisions easy to find:

1. Problem, context, users, and evidence
2. Goals, non-goals, success measures, and constraints
3. User scenarios and compact Flow Contract
4. Functional requirements and observable acceptance criteria
5. Technical Design Contract and chosen trade-offs
6. Delivery plan, rollout/rollback, observability, and verification
7. Risks, assumptions, dependencies, and open decisions

Avoid duplicating the same decision across sections. Link to an authoritative schema or existing design instead of copying it. Keep unresolved decisions visible and assign the point by which they must be resolved.

## Design quality gate

Before calling a PRD implementation-ready, verify:

- each critical user outcome maps to implementable system behavior;
- each changed state or result supports the intended continuation and applicable lifecycle, or has an explicit handoff boundary;
- repository evidence and proposals are distinguishable;
- important state/data ownership and boundary contracts have one interpretation;
- credible failure, compatibility, migration, and rollback behavior is resolved;
- security/privacy and operability were considered in proportion to risk;
- implementation can be sliced without shipping broken or unreachable behavior;
- acceptance tests prove the user outcome and the riskiest technical assumptions;
- remaining open decisions have an owner or decision point and do not block the first slice.
