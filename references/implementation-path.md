# Single authoritative implementation path

Use this when changing an existing capability across files or turns, especially after a large replacement, partial migration, legacy reuse, or repeated bug-fix patches. The objective is not one file or one entry point. It is one authoritative execution chain, state machine, state owner, and side-effect owner for the user capability.

## Reconstruct before editing

Trace the current capability from every supported trigger to its observable result. Search by user terms and domain identifiers, not only the file named in the request. Inspect applicable:

- routes, buttons, commands, API handlers, scheduled triggers, and event consumers;
- hooks, stores, reducers, state-machine definitions, status enums, and persistence records;
- services/use cases, jobs, queues, workers, listeners, callbacks, and retry loops;
- direct side-effect calls such as writes, sends, charges, exports, or external requests;
- feature flags, compatibility shims/adapters, deprecated modules, fallback branches, and dual-read/write logic;
- tests and fixtures that still encode an older transition or result path.

Write down the current chain and contradictions before patching. A new implementation is not authoritative merely because new code calls it; authority is proven only when every supported entry converges on it and no old path can still advance state or produce the side effect independently.

## Choose one change strategy

Choose explicitly before implementation:

1. **Evolve in place** — retain the existing authoritative chain and modify its states/contracts. Reuse its state owner and side-effect boundary. Do not build a second chain and switch between them.
2. **Replace** — establish the new authoritative chain and account for every old route, state transition, store/reducer, worker/listener, side-effect trigger, flag, adapter, and test. Delete all superseded paths in the same coherent change.

Do not combine these strategies accidentally. In particular, avoid “new path with legacy fallback,” “new store synchronized from old store,” or “new worker while old listener remains for safety.” Those patterns create two sources of behavioral truth and make retries, recovery, and terminal state nondeterministic.

## No compatibility execution path

Do not keep a compatibility adapter, legacy fallback, shadow state machine, dual-read/write bridge, or old worker beside the authoritative implementation. Even a nominally stateless adapter preserves another route, contract, test surface, and future patch location. Delete it and point every supported entry directly at the authoritative convergence point.

Feature flags may control exposure or activation of the one implementation, but must not select between implementations. If an external protocol or stored-data migration is truly required, handle version parsing or data conversion at the boundary and immediately normalize into the same domain command and state model; it must not preserve an alternate business workflow. Instrument the authoritative path when comparison evidence is needed rather than running a second workflow in shadow.

## Detect patch accumulation proactively

Do not wait for the user to identify duplicate logic. Stop and reconstruct the capability when repository evidence shows any of these warning signs:

- the same domain status or transition appears in multiple enums, reducers, stores, or persistence models;
- the same external side effect can be reached from multiple handlers, workers, listeners, retry loops, or direct call sites;
- a compatibility, fallback, deprecated, adapter, v2, or temporary branch can still complete the user capability;
- a feature flag selects old versus new behavior rather than exposure of one behavior;
- client state, server state, and job state independently advance the same lifecycle;
- new tests are added for a new path while old path tests still pass independently.

Treat these as architecture defects, not local bugs. Identify the intended state owner, convergence point, and side-effect owner; then either evolve that path or replace it and delete the others. Fix the ownership or boundary flaw that made the patch necessary instead of adding a synchronizer, bridge, or compensating state.

## Patch hygiene across turns

At the start of each later turn, re-read the changed execution chain and current diff instead of assuming the previous mental model is still complete. Before adding a new state, handler, or fallback, ask which authoritative owner should absorb the behavior. Prefer changing that owner over layering a compensating branch elsewhere.

After implementation:

1. Trace every supported entry to the same convergence point.
2. Search for old route names, state values, reducer/store APIs, job names, event topics, feature flags, side-effect calls, and tests.
3. Remove unreachable or superseded code rather than leaving it “for safety.”
4. Prove one owner performs each external side effect and retry cannot reach another implementation.
5. Test main, failure, retry, refresh/re-entry, and applicable data/protocol migration behavior against the same authoritative state.

Record the concrete old symbols and search patterns under `negative_searches`, and the convergence and single-side-effect tests under `authority_tests`. “Reviewed for duplicates” is not sufficient evidence.

Do not declare completion while an old path is merely believed to be unused. Delete it and use negative repository searches plus authority tests to prove it cannot execute.

## Compact contract

For a non-trivial replacement, record this inline in the plan or Technical Design Contract:

```text
Capability: report generation
Strategy: replace
Entries: report page, API, scheduled trigger
Converges at: GenerateReport command
Authoritative state machine: report_runs owned by Report service
Side-effect owner: Report worker writes artifact once under run_id idempotency
Inspected paths: legacy controller, old reducer, queue consumer, scheduler, feature flags, tests
Removed paths: old controller, old reducer, old worker, old feature flag, superseded tests
Verification: all entries create the same run type; old statuses/topics/side-effect calls have no remaining matches; retry executes only Report worker
```

Use `technical.implementation_path` in the machine-checkable Flow Contract when the path spans enough files, triggers, or migration behavior that prose could hide an unaccounted legacy implementation.
