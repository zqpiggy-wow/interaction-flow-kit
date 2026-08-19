# Support

## First checks

```bash
interaction-flow-kit doctor --target agents --scope project
interaction-flow-kit status --target all --scope project --json
interaction-flow-kit validate
```

`doctor` exits nonzero when a check fails and prints the next recommended command. `--json` makes the result suitable for Agent or CI inspection.

## Common issues

### The Agent cannot see the skill

1. Run `interaction-flow-kit targets --target <agent> --scope <project|global>`.
2. Run `interaction-flow-kit status` with the same target and scope used during install.
3. Start a new Agent turn after install or upgrade.
4. Invoke `$interaction-flow-kit` explicitly once to distinguish discovery from skill-content problems.

For example:

```bash
interaction-flow-kit status --target claude --scope global
interaction-flow-kit status --target trae --scope project
```

The default target is `agents` and the default scope is `project`. Project scope discovers the nearest Git root. A dedicated Agent target will not see an installation made only to another Agent's private directory.

### Install refuses to overwrite an existing skill

The directory does not carry this CLI's management manifest, so it may contain user work. Inspect it first. If replacement is intentional:

```bash
interaction-flow-kit install --target claude --scope project --force
```

The existing directory is moved to a timestamped backup before replacement.

### Installed content differs from the package

`status` compares content fingerprints rather than trusting version labels. Use:

```bash
interaction-flow-kit upgrade --target <same-target> --scope <same-scope>
```

The previous copy is preserved beside the installation.

### Restore after uninstall or upgrade

The CLI prints the exact backup path. Remove or move aside the current installation, then rename that backup to `interaction-flow-kit` inside the same skills directory.

### Node.js version error

The CLI supports Node.js 20 or newer. The installed skill itself is Markdown/YAML and has no runtime dependency; Node is needed only for lifecycle commands.

## Compatibility boundary

The installer supports native project/global skill directories for `.agents`, Codex, Claude Code, Trae IDE, TraeCode CLI, and OpenCode. It copies a standard `SKILL.md` bundle; it does not edit Agent configuration files, permissions, marketplaces, or instruction files.

`trae` means Trae IDE (`.trae/skills`). Use `trae-cli` for TraeCode CLI (`.traecli/skills`). OpenCode can also discover `.agents` and `.claude` targets, but its native target remains available.

The skill improves Agent decisions; it cannot add backend cancellation, progress, persistence, or idempotency that the product does not implement. In those cases it should surface the missing capability rather than simulate it in the UI.

## Reporting a problem

Include:

- `interaction-flow-kit version`;
- `node --version`;
- `interaction-flow-kit doctor --json`;
- the command that failed and its complete error output;
- operating system and Agent name;
- the exact `--target`, `--scope`, and optional `--project-root` or `--dest` used.

Do not include secrets, private prompts, proprietary source, or full home-directory listings.
