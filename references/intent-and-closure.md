# Intent and outcome closure

Use this when a request names a feature, control, or implementation but leaves the real purpose implicit. The goal is not speculative feature expansion; it is to avoid faithfully implementing the wrong problem boundary.

## Infer the job before the interface

Treat the literal request as a proposed means, even when it is phrased as a requirement. Reconstruct the shortest credible outcome chain:

```text
Trigger/context -> desired change -> proposed means -> changed state or result -> continuation -> completed job
```

Use repository and product evidence first: where the request arises, adjacent actions, existing lifecycle behavior, user roles, prior terminology, data sensitivity, and current technical seams. Distinguish:

- **Trigger:** the event, friction, or opportunity that made the need arise.
- **Stated means:** the capability, surface, or implementation the user named.
- **Desired change:** what should become possible, easier, safer, or no longer necessary.
- **Object and lifecycle:** what information, resource, decision, relationship, or work changes before, during, and after the operation.
- **Continuation:** who or what uses the changed state next, in which context.
- **Completion evidence:** what can be observed when the job—not merely the operation—is done.
- **Constraints and harms:** what must remain compatible, private, reversible, attributable, or under user control.
- **Assumption or decision:** what is inferred versus what materially needs confirmation.

Use two tests before accepting the stated means as the feature boundary:

1. **Counterfactual completion:** If the named capability works exactly as stated, can the user still fail to achieve the likely job? If so, identify what is missing.
2. **Removal test:** If the proposed means did not exist, could a simpler existing path achieve the job with less effort or risk? If so, improve or connect that path instead of duplicating capability.

Prefer the most coherent interpretation supported by context. For a low-risk, reversible decision, proceed with a clearly stated assumption. Ask a focused question only if alternatives change scope, destructive risk, permissions, data compatibility, or architecture. Do not ask users to choose implementation details the product can reasonably decide.

## Close the relevant lifecycle

Trace only lifecycle phases that could block, confuse, or endanger the intended job:

- **Before:** discovery, prerequisites, current state, selection, and permission.
- **Change:** input, preview, confirmation, execution, feedback, and control.
- **After:** verification, consumption, handoff, return, monitoring, or the next decision.
- **Later:** correction, reuse, reconciliation, expiry, reversal, retention, or removal when the object persists.

Not every feature needs all four phases. Select the smallest coherent boundary supported by the job and risk. Prefer connecting a suitable existing surface over duplicating it. If continuation belongs outside the product, make the handoff usable and explicit.

## Capability probes

Use these as prompts for uncovering hidden intent, not as mandatory feature bundles:

| Stated means | Intent questions that change the design |
|---|---|
| Create/add | What new outcome becomes possible; where is it found and used; can duplicates or abandoned drafts exist? |
| Search/filter | What decision or action follows finding; which scope and freshness matter; should criteria or results persist? |
| Generate/summarize/recommend | How will the result be judged, corrected, attributed, applied, and kept current? |
| Export/report | Is the job inspection, handoff, modification, audit, backup, or migration; what format and continuation make it usable? |
| Import/upload | What is being established; how are preview, validation, conflicts, partial results, and correction handled? |
| Edit/configure | When does a change take effect; what scope, preview, validation, history, and reversal are needed? |
| Sync/automate | What triggers it; which side is authoritative; how are conflicts, exceptions, monitoring, pause, and recovery handled? |
| Share/notify/assign | Who must receive, understand, acknowledge, or act; what permission, expiry, escalation, or audit semantics matter? |
| Delete/archive/disable | Is the job removal, decluttering, access revocation, or stopping behavior; what dependencies and recovery remain? |

The same stated means can serve different jobs, and the same job can be served by different means. Do not mechanically add every action suggested by a row.

For example, exporting configuration could support inspection, handoff, backup, migration, or modification and reuse. Those jobs imply different result and technical contracts; import is relevant to some, not all. This is one illustration of the general method.

## Carry intent into implementation

Record the inferred job and continuation in the existing PRD, spec, or plan. Then ensure:

- acceptance criteria test the completed job, not only operation success;
- the changed state or result supports the relevant continuation;
- identity, lifecycle, validation, permissions, compatibility, provenance, and reversibility are specified where applicable;
- analytics and observability distinguish operation success from job completion when that distinction matters;
- vertical slices reach a usable outcome rather than stopping at an isolated layer or control.

During review, treat a wrong problem boundary or missing lifecycle link as a root-cause finding. Group surface symptoms under it when they share the same incomplete job.
