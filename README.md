# Interaction Flow Kit

> Stop shipping requested features that still leave the user unable to finish the job.

[![npm](https://img.shields.io/npm/v/interaction-flow-kit?color=cb3837)](https://www.npmjs.com/package/interaction-flow-kit)
[![CI](https://github.com/zqpiggy-wow/interaction-flow-kit/actions/workflows/ci.yml/badge.svg)](https://github.com/zqpiggy-wow/interaction-flow-kit/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Interaction Flow Kit is an Agent Skill and zero-dependency CLI that turns feature requests into complete user outcomes and implementation-ready behavior. It helps coding agents reason beyond the requested button, API, or job so the result is discoverable, understandable, recoverable, reusable, and honest about what the system can support.

Use it with Codex, Claude Code, Trae, TraeCode CLI, OpenCode, or any tool that supports the Agent Skills format.

## Install

Requires Node.js 20 or newer.

```bash
npx interaction-flow-kit install
```

This installs the skill into the current Git project's `.agents/skills` directory. Start a new Agent session or turn so skill discovery refreshes, then invoke it explicitly when you want it:

```text
Use $interaction-flow-kit while planning and implementing this feature.
Keep the Flow Contract concise and carry the decisions into code and tests.
```

The skill may also be selected automatically for matching product-flow work.

## Why it exists

Coding agents are good at implementing the noun in a request. That is not always the same as completing the user's job.

| Request | An isolated implementation can stop at | The user still needs |
|---|---|---|
| “Add retry” | A button that calls the operation again | Idempotency, preserved input, authoritative status, and a clear result |
| “Export this data” | A working export endpoint | A discoverable entry, progress or completion feedback, download recovery, and result retention |
| “Generate a report” | A background generation job | Re-entry, partial-result behavior, provenance, and a useful next action |
| “Use this result in analysis” | A result ID passed somewhere downstream | Compatible selection, visible source binding, stale-data behavior, and a correction path |

Interaction Flow Kit applies one counterfactual test throughout planning, implementation, and review:

> If the requested capability worked exactly as described, could the user still fail to accomplish the likely job?

If the answer is yes, the design boundary is incomplete. The skill finds the missing boundary without automatically expanding the feature into a larger product.

## What changes

The skill keeps a compact **Flow Contract** inside the PRD, specification, plan, or implementation work already being produced. It resolves only the decisions that matter for the change:

- the real intent and the observable evidence that the job is complete;
- the shortest understandable path from entry to outcome;
- what is already known, what must be asked now, and what can wait;
- meaningful feedback, control, interruption, validation, and recovery behavior;
- where durable work can be found again and how authoritative state is reconciled;
- how the changed state or result participates in the user's next step.

For architecture-sensitive work, it adds a proportional **Technical Design Contract** covering current-system evidence, ownership and sources of truth, interfaces and failure semantics, migration, rollout and rollback, observability, tests, and unresolved risk.

For cross-stage data, it makes the handoff explicit: each flow's data boundary, single-writer ownership, operation identity versus result identity, authoritative storage, boundary fields, downstream binding, compatibility, provenance, and staleness. It rejects cross-boundary writes and reciprocal dependencies that turn two modules into one coupled state machine.

## When to use it

Interaction Flow Kit is designed for people using coding agents to build or review user-facing product behavior. It is especially useful for:

- PRDs, feature specs, and implementation plans;
- long-running or asynchronous work;
- workflows that cross screens, services, sessions, or actors;
- generation, import/export, approval, automation, and data-pipeline features;
- changes with meaningful failure, cancellation, retry, or partial results;
- reviews where the implementation works locally but the end-to-end job may not.

It is intentionally lightweight for small changes. A synchronous local action may need one sentence, not a diagram or a standalone artifact. It is not a UI component library, a diagram generator, or a replacement for product judgment.

## How the Agent works

1. **Inspect before inventing.** Find the current entry surfaces, state, APIs, jobs, persistence, permissions, and tests relevant to the request.
2. **Infer the job.** Treat the requested capability as a proposed means, then trace the trigger, desired change, result, continuation, and completion evidence.
3. **Resolve the contract.** Make important interaction and technical decisions explicit at a level proportional to risk.
4. **Implement vertical slices.** Connect a real entry through authoritative behavior to an observable outcome.
5. **Verify the journey.** Test the main path and plausible interruption or failure paths, including whether the result remains discoverable and actionable.

The detailed instructions live in [SKILL.md](SKILL.md). Deeper guidance is loaded progressively only when the task needs it.

## Optional evidence and contract tools

The skill works without generating files. For complex work, the bundled CLI provides deterministic evidence and a machine-checkable handoff.

Inspect a repository for relevant implementation evidence:

```bash
ifk inspect --root . --query "approval workflow"
ifk inspect --root . --query "approval workflow" --json
```

The scanner returns bounded candidates with file and line attribution across entry surfaces, state and data, implementation paths, interfaces, background work, permissions, observability, and tests. Implementation-path evidence highlights reducers/stores, legacy or fallback branches, workers/listeners, flags, and side-effect triggers that could leave two live state machines after a rewrite. Matches are evidence candidates, not architectural conclusions.

Create and validate a contract when a durable or cross-boundary flow is too ambiguous for concise prose:

```bash
ifk contract init "Approval workflow" > flow-contract.json
ifk contract validate flow-contract.json
ifk contract render flow-contract.json > flow-design.md
```

Validation checks intent, completion, flow graph references, recovery semantics, ownership, interfaces, data lineage, flow data boundaries, cyclic dependencies, invariants, and verification. Rendering produces reviewable Markdown, Mermaid, and applicable technical tables. These tools are optional; a valid schema is never treated as proof that the product design is correct.

For a non-trivial rewrite, the optional `technical.implementation_path` contract records the supported entries, convergence command/use case, authoritative state machine and side-effect owner, inspected paths, and every superseded path deleted by the replacement. Validation rejects adapter/fallback fields, requires replacement paths to name concrete removals, and checks that removed paths were inspected.

## Installation targets

The default is a safe, project-local Agent Skills installation. Global installation is always explicit.

```bash
npx interaction-flow-kit install --scope global
npx interaction-flow-kit install --target claude --scope project
npx interaction-flow-kit install --target codex,claude,trae,opencode --scope global
npx interaction-flow-kit install --target all --scope project
```

| Target | Project scope | Global scope |
|---|---|---|
| `agents` (default) | `<project>/.agents/skills` | `~/.agents/skills` |
| `codex` | `<project>/.agents/skills` | `$CODEX_HOME/skills` or `~/.codex/skills` |
| `claude` | `<project>/.claude/skills` | `~/.claude/skills` |
| `trae` | `<project>/.trae/skills` | `~/.trae/skills` |
| `trae-cli` | `<project>/.traecli/skills` | `~/.traecli/skills` |
| `opencode` | `<project>/.opencode/skills` | `$XDG_CONFIG_HOME/opencode/skills` or `~/.config/opencode/skills` |

Trae IDE and TraeCode CLI use different directories. OpenCode also reads `.agents/skills` and `.claude/skills`; use its dedicated target only when you want the native directory. Multiple targets that resolve to the same directory are deduplicated.

Use `--project-root <dir>` to override Git-root discovery. Advanced users can use `--dest <skills-directory>` for one custom location; it cannot be combined with `--target` or `--scope`.

## CLI

`interaction-flow-kit` and the shorter `ifk` command are equivalent.

```text
ifk inspect                   Inspect repository evidence for a feature
ifk contract init             Create an editable flow contract
ifk contract validate         Validate semantics and graph references
ifk contract render           Render Markdown, Mermaid, and technical tables
ifk install                   Install for selected Agents and scope
ifk upgrade                   Sync managed installations to this CLI version
ifk status                    Show installation and content status
ifk doctor                    Diagnose selected installations
ifk validate [path]           Validate a skill directory and its references
ifk prompt [mode]             Print a plan, spec, PRD, design, or review prompt
ifk targets                   Resolve target paths
ifk uninstall                 Remove selected managed installations
```

Ready-made entry prompts are available with `ifk prompt plan|spec|prd|design|review`. Lifecycle commands support `--json` for Agents and CI.

### Safe updates and removal

- Re-running `install` is a no-op when content is current.
- Multi-target commands preflight every destination before writing.
- `upgrade` backs up the previous managed copy before replacing it.
- An unmanaged skill is never overwritten unless `--force` is explicit, and it is still backed up first.
- `uninstall` is recoverable by default; `--purge` is required for permanent deletion.

## Skill layout

```text
SKILL.md                          Agent entrypoint and decision rules
agents/openai.yaml                Codex UI metadata and invocation policy
references/agent-workflow.md      Planning and implementation workflow
references/intent-and-closure.md  Intent inference and outcome closure
references/technical-design.md    PRD and technical-design workflow
references/data-lineage.md        Durable cross-stage data handoffs
references/implementation-path.md Single authoritative path and legacy cleanup
references/review.md              Evidence-backed flow review
references/artifacts.md           Optional diagrams and tables
schemas/flow-contract.schema.json Machine-readable contract shape
scripts/inspect-repository.mjs    Repository evidence scanner
scripts/flow-contract.mjs         Contract initializer, validator, and renderer
```

## Development

```bash
npm install
npm run check
npm pack --dry-run
```

The test suite covers the CLI lifecycle, safe installation behavior, repository inspection, contract validation and rendering, and cross-stage lineage rules on Node.js 20, 22, and 24.

Tags matching `v*` run validation and tests, publish the npm package with provenance, and attach the exact tarball to a GitHub Release. Release notes are maintained in [CHANGELOG.md](CHANGELOG.md).

Contributions are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for the local workflow and the kinds of changes that are most useful. For installation problems, run `ifk doctor` first and see [SUPPORT.md](SUPPORT.md).

## License

[MIT](LICENSE)
