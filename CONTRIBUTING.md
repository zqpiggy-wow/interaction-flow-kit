# Contributing

Thanks for helping make Interaction Flow Kit more useful in real product work. The strongest contributions are grounded in an observed Agent failure or an interaction boundary that existing guidance does not handle clearly.

## Before opening a change

- Check existing issues and the current guidance in `SKILL.md` and `references/`.
- Prefer a focused correction over adding a universal rule for one unusual example.
- Keep ordinary flows lightweight. New required steps, artifacts, or fields should prevent a concrete failure that cannot be handled proportionally.
- Preserve user intent and authorization boundaries. The skill should improve the requested work without silently expanding it.

For substantial behavior changes, open an issue first with the request that exposed the problem, the current result, and the outcome you expected.

## Local workflow

Requires Node.js 20 or newer.

```bash
npm install
npm run check
npm pack --dry-run
```

`npm run check` validates the bundled skill and runs the full Node test suite. If you change a script, schema, installer behavior, or validator rule, add coverage for the observable behavior rather than matching incidental wording.

## Pull requests

Keep pull requests narrow and explain:

- the real request or failure that motivated the change;
- which decision or behavior changes;
- why the new guidance remains proportional;
- how you verified it.

Do not include generated installations, package tarballs, credentials, or unrelated formatting changes. By contributing, you agree that your contribution is licensed under the repository's MIT License.
