# Interaction Flow Kit

An Agent skill for inferring the real job behind a feature request, then designing it from PRD through technical design and implementation so it is easy to discover, understand, complete, recover, use, operate, and evolve.

It is deliberately not a diagram generator. The default artifact is a compact Flow Contract embedded into the work already being done. Diagrams and tables appear only when they remove real implementation ambiguity.

For PRDs and architecture-sensitive work, it adds a proportional Technical Design Contract: current-system evidence, chosen design and trade-offs, data/state ownership, interfaces and failure semantics, migration/rollout, observability, and verification. Product and technical design are produced together so the PRD does not promise behavior the implementation cannot deliver.

## What it changes

Without flow guidance, an Agent can implement a working API or component that users cannot find, cannot understand while it runs, and cannot recover when it fails. Interaction Flow Kit keeps these decisions attached to the code:

- where the task is discovered and where durable work is found again;
- which inputs are known, safely inferred, required now, or deferrable;
- what feedback and control the user needs at meaningful states;
- how validation, interruption, failure, cancellation, and partial results behave;
- what usable outcome proves the user's job is complete.
- how the changed state or result participates in the rest of the job, so operation success is not mistaken for completion.

The skill treats a named feature as a proposed means, then reconstructs its trigger, desired change, changed state, continuation, and completion evidence. A counterfactual check catches shallow solutions: if the named capability worked perfectly but the user could still not finish the likely job, the design boundary is incomplete. This applies equally to creation, search, AI generation, configuration, automation, sharing, and removal; it does not prescribe adjacent features by rote.

The skill scales its effort to risk. A local synchronous action may need one sentence in a plan. A long-running cross-system task may need durable state ownership, re-entry, idempotent retry, and a compact transition table.

## Install

Requires Node.js 20 or newer. The package has no runtime dependencies.

```bash
npx interaction-flow-kit install
```

The safe default installs to the current project's `.agents/skills/interaction-flow-kit`. When run from a nested directory, the CLI walks up to the nearest Git root. This portable target is understood by Agent Skills-compatible tools and is also read by OpenCode.

Choose a dedicated Agent target and scope when needed:

```bash
npx interaction-flow-kit install --scope global
npx interaction-flow-kit install --target claude --scope project
npx interaction-flow-kit install --target codex,claude,trae,opencode --scope global
npx interaction-flow-kit install --target all --scope project
```

`project` is the default scope; `global` is always explicit. Start a new Agent session or turn after installation so discovery refreshes.

### Supported targets

| Target | Project scope | Global scope |
|---|---|---|
| `agents` (default) | `<project>/.agents/skills` | `~/.agents/skills` |
| `codex` | `<project>/.agents/skills` | `$CODEX_HOME/skills` or `~/.codex/skills` |
| `claude` | `<project>/.claude/skills` | `~/.claude/skills` |
| `trae` | `<project>/.trae/skills` | `~/.trae/skills` |
| `trae-cli` | `<project>/.traecli/skills` | `~/.traecli/skills` |
| `opencode` | `<project>/.opencode/skills` | `$XDG_CONFIG_HOME/opencode/skills` or `~/.config/opencode/skills` |

Trae IDE and TraeCode CLI use different directories, so they are separate targets. OpenCode additionally reads `.agents/skills` and `.claude/skills`; use the dedicated `opencode` target only when you want its native directory.

Multiple targets that resolve to one directory are deduplicated. For example, `agents,codex` at project scope writes one `.agents/skills` installation. Use `--project-root <dir>` to override Git-root discovery. Advanced users may use `--dest <skills-directory>` for one custom location; it cannot be combined with `--target` or `--scope`.

### Install from a checkout

```bash
cd interaction-flow-kit
npm install
npm run check
npm link
interaction-flow-kit install
```

## Use

The skill is automatically discoverable for matching product-flow work, or invoke it explicitly:

```text
Use $interaction-flow-kit while planning and implementing this feature.
Keep the Flow Contract concise and put usability decisions directly into the implementation plan.
```

Ready-made entry prompts are available from the CLI:

```bash
interaction-flow-kit prompt plan
interaction-flow-kit prompt spec
interaction-flow-kit prompt prd
interaction-flow-kit prompt design
interaction-flow-kit prompt review
```

### Evidence and contract tools

For architecture-sensitive work, scan the repository for concrete interaction and system evidence:

```bash
ifk inspect --root . --query "approval workflow"
ifk inspect --root . --query "approval workflow" --json
```

The scanner returns bounded candidates with files, line numbers, and match signals across entry surfaces, state/data, interfaces, background work, permissions, observability, and tests. It does not claim that a match is the correct architecture.

For a complex or cross-boundary flow, use a machine-checkable contract only when it reduces ambiguity:

```bash
ifk contract init "Approval workflow" > flow-contract.json
ifk contract validate flow-contract.json
ifk contract render flow-contract.json > flow-design.md
```

Validation checks intent, completion, flow-step identities, graph references, recovery semantics, ownership, interfaces, data flows, invariants, and verification. Rendering deterministically produces a compact intent contract, Mermaid flow, and applicable technical tables. The JSON contract has no user-managed version lifecycle.

## CLI

```text
interaction-flow-kit inspect              Inspect repository evidence for a feature
interaction-flow-kit contract init        Create an editable flow contract
interaction-flow-kit contract validate    Validate semantics and graph references
interaction-flow-kit contract render      Render Markdown, Mermaid, and technical tables
interaction-flow-kit install              Install for selected Agents and scope
interaction-flow-kit upgrade              Sync selected installations to this CLI version
interaction-flow-kit status               Show selected installation/content status
interaction-flow-kit doctor               Diagnose selected destinations/installations
interaction-flow-kit validate [path]      Validate a skill directory and its references
interaction-flow-kit prompt [mode]        Print a plan, spec, or review prompt
interaction-flow-kit uninstall            Remove selected managed installations
interaction-flow-kit targets              Resolve and display target paths
```

Use `ifk` as a short alias. `install`, `upgrade`, `status`, `doctor`, `targets`, and `uninstall` accept the same `--target` and `--scope` selectors. They support `--json` for Agents and CI.

### Safe updates and removal

- Re-running `install` is a no-op when content is already current.
- Multi-target commands preflight every destination before writing, so a conflict does not leave a partial installation.
- `upgrade` moves a previous copy to a timestamped backup before replacing it.
- An unmanaged existing skill is never overwritten unless `--force` is explicit; it is still backed up first.
- `uninstall` is recoverable by default: it moves the exact skill directory to a timestamped sibling. `--purge` permanently deletes it.

## Skill layout

```text
SKILL.md                       Agent entrypoint and usability invariants
agents/openai.yaml             Codex UI metadata and default prompt
references/agent-workflow.md   Plan/spec/coding integration
references/intent-and-closure.md Intent inference and downstream outcome closure
references/technical-design.md PRD and technical-design workflow
references/review.md           Evidence-backed flow review
references/artifacts.md        Optional diagrams and tables
schemas/flow-contract.schema.json Machine-readable contract shape
scripts/inspect-repository.mjs Repository evidence scanner
scripts/flow-contract.mjs      Contract initializer, validator, and renderer
```

The Agent reads references progressively. Ordinary work does not load every guide.

## Development and release

```bash
npm run check
npm pack --dry-run
```

Tags matching `v*` run validation and tests, then publish the npm package with provenance through the GitHub Actions release workflow. Publishing requires the repository's npm trusted publisher or an `NPM_TOKEN` secret to be configured. A workflow file does not mean this checkout has been published.

Release notes are maintained in [CHANGELOG.md](CHANGELOG.md). The release workflow also attaches the exact npm tarball to a GitHub Release so the published artifact can be inspected independently.

## Support

Run `interaction-flow-kit doctor` first. See [SUPPORT.md](SUPPORT.md) for diagnostic output, compatibility boundaries, and what to include in an issue.

## License

MIT
