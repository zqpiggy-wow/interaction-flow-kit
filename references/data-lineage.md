# Cross-stage data lineage

Use this reference when durable data crosses steps, stages, services, sessions, or actors. Typical signals are background jobs, generated datasets, history/replay, imports, reports, approvals, handoffs, or a later stage that claims to use an earlier result. Do not require this treatment for a local synchronous interaction with no durable result or downstream consumer.

## The readiness invariant

A multi-stage design is not implementation-ready while a stage must invent which upstream result it consumes, how that result is selected or inherited, which fields cross the boundary, or how the user verifies and changes the binding. Completion of an operation is not a usable outcome when its result cannot be inspected, identified, selected, or consumed.

A design is also not implementation-ready when flows own or mutate each other's state. Assign each step that reads or writes durable data to a **data boundary**: the flow, module, or service that owns that step's state. Every durable object has one producing boundary and one source of truth. Other boundaries consume it through an explicit contract and may persist their own provenance or derived result, but they do not update or mirror the producer's internal status.

Separate these concepts even when one API currently returns them together:

- **Operation identity** identifies execution, status, retry, cancellation, logs, and audit history.
- **Result or dataset identity** identifies durable output that can be inspected, compared, retained, or consumed later.
- **Configuration identity** identifies the inputs or policy used to produce a result.
- **Binding identity/provenance** records which exact result a downstream execution consumed.

Do not pass an operation ID as if it were a dataset ID unless they intentionally identify the same domain resource; state that invariant explicitly.

## Keep boundaries directed

- **Single writer:** only the producing boundary writes an object. Corrections use the owner's command/API or create a new version; another flow never patches the owner's record or table.
- **Contract instead of shared state:** a consumer reads a stable identity and published representation. It owns its own processing state, not a synchronized copy of upstream flags.
- **Acyclic dependencies:** cross-boundary bindings form a directed acyclic graph. A may consume B or B may consume A; ordinary flows must not require both directions.
- **Independent failure:** failures cross the boundary as contract outcomes. A consumer does not reconstruct the producer's state machine from callbacks, partially copied fields, or local guesses.
- **Versioned evolution:** the producer owns compatibility rules for its published contract. Consumers do not reach into implementation-specific state to unblock themselves.

Reciprocal dependencies are a design failure even when each individual object has one writer. They create coupled state machines: A waits on B, B derives status from A, retries touch both, and each incident adds another synchronization flag.

If the domain genuinely contains a feedback loop, model it as a higher-level orchestration flow with its own data boundary. The orchestrator owns coordination state and specifies the trigger, sequence, termination or convergence condition, idempotency, timeout, retry, and recovery. Participant boundaries still expose inputs and outputs through one-way contracts; they do not drive each other by mutating reciprocal status.

## Resolve the node contract

For each meaningful producer or consumer, resolve only the applicable items:

| Concern | Decision to make |
|---|---|
| Reads and writes | Named domain objects read, created, or changed by this node |
| Data boundary | The flow/module/service that owns the node's durable state |
| Identity | Stable identifier for each operation, result, dataset, configuration, or record |
| Authority | Owning component and table/entity/object store or external source of truth |
| Boundary fields | Request, response, event, callback, or command fields that carry identity and required data |
| User projection | Summary/detail/history/preview the user can inspect, including empty and partial output |
| Consumer | Which later node, actor, or system uses the object and for what decision |
| Binding | How the consumer obtains the exact upstream object |
| Validity | Permission, tenant, schema/data version, configuration hash, time range, freshness, or other compatibility rules |
| Provenance and change | How the source is shown, corrected, refreshed, invalidated, or marked stale |

Link to authoritative schemas when they exist. Enumerate fields only when they are new, changed, or required to remove boundary ambiguity. A table name alone is not a data contract, and a payload without an authoritative owner is not a source of truth.

## Choose one binding mode

Every claimed upstream-to-downstream relationship uses one explicit mode:

1. **Inherit current** — the downstream action automatically consumes a known upstream result. Show the selected source and provide a correction path before a consequential run. Define what happens when the upstream result changes.
2. **Select compatible** — the user chooses from compatible completed results. Define the query/filter contract, empty state, default ordering, permission scope, compatibility rules, and what summary distinguishes candidates.
3. **Optional** — downstream can use an upstream result or run without it. Make the two modes and their behavioral differences explicit; preserve or clear the binding intentionally when the mode changes.
4. **Independent** — downstream does not consume upstream output. Do not present it as a required sequential stage; redesign the information architecture as parallel tools or explain the non-data dependency.

Do not add both selection and automatic inheritance merely for symmetry. Choose the least-effort mode that preserves user control and correctness.

## Data usability gate

For every produced durable object, answer at least one of these:

- where and how the user inspects a useful projection of it;
- which downstream consumer uses it through a defined binding;
- why it is intentionally internal and which observable outcome it enables.

A success toast, directory path, task status, or raw identifier is not a result projection. Handle empty, partial, expired, deleted, unauthorized, incompatible, and failed results when those states can occur. If a downstream selector has no compatible results, explain how to create or recover one without losing the current context.

## Provenance, compatibility, and staleness

Persist the source reference with the downstream execution or result; do not rely only on transient client state. Show enough provenance for the user and an operator to answer “what produced this?” Compatibility is a domain rule owned by the system, not a label filter invented by the UI.

When upstream data or configuration changes, choose and specify one behavior:

- downstream remains an immutable historical result with recorded provenance;
- downstream becomes stale and requires acknowledgement or rerun;
- downstream is automatically recomputed under safe, explicit semantics;
- the upstream change is blocked because an invariant requires immutability.

The interface, persistence model, API, and cache invalidation behavior must agree.

## Compact delivery shape

Keep this inline in the PRD or plan when possible:

```text
Stage B writes dataset `evaluation_result`, identified by `result_id`; `evaluation_runs` owns operation status and `evaluation_results` owns the output. The result page shows scope, metrics, item count, warnings, and empty/partial state. Stage C uses `select-compatible`: GET /evaluation-results filters by tenant, completed status, schema version, and policy hash; POST /stage-c accepts `source_result_id` and returns recorded `source_result_summary`. The chosen source remains visible and changeable until submit. Stage C persists provenance and is marked stale if the mutable source is superseded.
```

Use the machine-checkable Flow Contract only when the number of nodes or boundaries makes prose easy to misread. Its optional `data_objects`, step `reads`/`writes`, and `data_bindings` render a lineage table and catch broken references or incomplete binding semantics.

For machine-checkable contracts, add `data_boundary` to every step that has `reads` or `writes`. Validation rejects writes from a different boundary, attempts to write external objects, and cycles in the cross-boundary binding graph.
