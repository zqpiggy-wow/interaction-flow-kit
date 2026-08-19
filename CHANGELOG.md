# Changelog

## Unreleased

- Add cross-stage data lineage guidance for operation/result identity, authoritative storage, boundary fields, user projections, downstream binding, compatibility, provenance, and staleness.
- Extend Flow Contract validation and rendering with optional data objects, step reads/writes, and explicit inherit/select/optional/independent bindings.
- Add behavioral coverage for replay-result display and compatible downstream dataset selection.

All notable changes to Interaction Flow Kit are recorded here.

## [0.1.0] - 2026-08-19

### Added

- Agent-native interaction guidance for spec, planning, coding, and review.
- General intent-to-outcome reasoning that treats a stated feature as a proposed means, tests its problem boundary, and closes the relevant lifecycle without automatic scope expansion.
- Usability-first Flow Contract with progressive detail instead of mandatory diagrams.
- Optional flow, state, sequence, information, and data-flow artifacts.
- Implementation-oriented PRD and Technical Design Contract covering system evidence, design trade-offs, ownership/contracts, migration, rollout, operability, and verification.
- Dependency-free `interaction-flow-kit` / `ifk` CLI.
- Safe install, content-aware status, diagnostics, upgrade with backup, and recoverable uninstall.
- Project/global installation for `.agents`, Codex, Claude Code, Trae IDE, TraeCode CLI, and OpenCode, including deduplicated multi-target operations.
- Machine-readable JSON output and ready-made Agent prompts.
- Executable repository evidence scanner with bounded, file-and-line-attributed results.
- Optional JSON Flow Contract initializer, semantic/graph validator, and deterministic Markdown/Mermaid/table renderer.
- Node 20/22/24 CI, npm packaging checks, and tag-driven npm/GitHub release workflow.
