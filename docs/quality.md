# Code quality

This document covers the non-test side of "is the code OK": linting, formatting, type checking, and the pre-commit hook that runs them. The test side lives in `testing.md`. Together, the two docs describe everything CI runs and everything a developer should be able to run locally before pushing.

The principle is the same one that runs through the rest of the architecture: **boring, well-understood components, configured the same way locally and in CI**. Every check below produces the same verdict on a developer's laptop and on the CI runner. If they disagree, that's a bug in the configuration, not "the CI is being weird."

## Toolchain at a glance

Cairn is polyglot — TypeScript/Svelte in `web/`, SQL in `db/`, shell in `scripts/` — so the toolchain is too. Each language gets a real tool for each concern, not a "we'll figure out SQL later" placeholder.

| Concern             | TypeScript / Svelte                                                 | SQL                                                  | Shell                                     |
| ------------------- | ------------------------------------------------------------------- | ---------------------------------------------------- | ----------------------------------------- |
| Type / static check | `svelte-check` (TS + Svelte)                                        | (Postgres parses on apply)                           | (none)                                    |
| Lint                | ESLint (flat config) + `eslint-plugin-svelte` + `typescript-eslint` | [SQLFluff](https://sqlfluff.com/) (Postgres dialect) | [ShellCheck](https://www.shellcheck.net/) |
| Format              | [Prettier](https://prettier.io/) + `prettier-plugin-svelte`         | SQLFluff format                                      | [shfmt](https://github.com/mvdan/sh)      |
| Editor baseline     | `.editorconfig`                                                     | `.editorconfig`                                      | `.editorconfig`                           |

A single pre-commit hook (lefthook) runs all of the above on the files about to be committed. CI runs them on the whole tree.

## TypeScript and Svelte

### Type checking with `svelte-check`

`svelte-check` walks the project, type-checking `.ts`, `.js`, and `.svelte` files using the project's `tsconfig.json`. It is the authoritative check for "does this code type-check"; `tsc` alone doesn't understand `.svelte` files, and the editor's red squiggles can quietly disagree with what the build sees.

```bash
cd web
pnpm check          # one-shot
pnpm check:watch    # watch mode while developing
```

The `tsconfig.json` extends the SvelteKit-generated config and turns on `strict: true`. Notable additions:

- `checkJs: true` and `allowJs: true`: any plain `.js` we have is type-checked too. This catches drift in adapter config, build scripts, and similar.
- `forceConsistentCasingInFileNames`: prevents the macOS/Linux import-casing bug where `Foo.svelte` and `foo.svelte` resolve on one OS and break on the other.
- `rewriteRelativeImportExtensions`: allows writing `./foo.ts` in imports while still emitting `./foo.js`. Reduces friction with editors that auto-add the source extension.

We do not soften strictness with `noImplicitAny: false` or `strictNullChecks: false`. If a third-party type is hostile, we narrow it once at the import boundary and keep the rest of the codebase strict.

#### Navigating to a not-yet-created SvelteKit route

SvelteKit (≥ 2.26) generates a string-literal union of registered routes for `$app/types`'s `RouteId` / `Pathname` and uses it to type `resolve(...)` from `$app/paths`. The ESLint rule `svelte/no-navigation-without-resolve` then enforces `goto(resolve('/foo'))` over a bare `goto('/foo')`.

When the plan-ordering puts the navigation call ahead of the destination route's `+page.svelte` (e.g. `LoginRequest` was landed before the `/auth/check` route file existed in `web/src/routes/`), `resolve('/auth/check')` fails type-check — only `/` is in the generated route union — and `goto('/auth/check')` directly fails lint.

The pattern: **use the literal string with a per-line ESLint disable that names the follow-up task**.

```svelte
// /auth/check route is created in task 3.5 — until then
// `resolve()` types reject the path. Swap back to
// `goto(resolve('/auth/check'))` once that task lands.
// eslint-disable-next-line svelte/no-navigation-without-resolve
await goto('/auth/check');
```

When the destination route lands, grep for the disable comment, remove it, and switch to `resolve(...)`. The justification comment is the load-bearing part — a bare disable rots; a disable with a task pointer self-cleans the next time anyone touches that route.

### Linting with ESLint

ESLint catches the things the type checker can't: unused variables, prefer-const, accidental `console.log`, Svelte-specific rules (each `{#each}` needs a key, no orphan `<script>` tags, accessible labels). The config is the modern flat-config form (`eslint.config.js`), composed of three layers:

```js
// web/eslint.config.js (sketch)
import js from "@eslint/js";
import ts from "typescript-eslint";
import svelte from "eslint-plugin-svelte";
import prettier from "eslint-config-prettier";

export default [
	js.configs.recommended,
	...ts.configs.recommendedTypeChecked,
	...svelte.configs["flat/recommended"],
	prettier, // disables stylistic rules Prettier owns; must be last
	{
		languageOptions: { parserOptions: { project: "./tsconfig.json" } },
		rules: {
			"no-console": ["warn", { allow: ["warn", "error"] }],
			"@typescript-eslint/no-unused-vars": [
				"error",
				{ argsIgnorePattern: "^_" },
			],
		},
	},
];
```

Two non-defaults worth knowing:

- **`recommendedTypeChecked`** (not just `recommended`) — gives us rules that look at actual types, like `no-floating-promises` and `no-unsafe-argument`. These catch a class of bugs unique to async code that the TS compiler accepts.
- **`eslint-config-prettier` last.** Prettier is the source of truth for formatting; ESLint should not duplicate-and-disagree about whether a line should wrap. The `prettier` config disables every stylistic rule, leaving ESLint to handle only correctness.

```bash
cd web
pnpm lint           # check
pnpm lint:fix       # auto-fix what's auto-fixable
```

### Formatting with Prettier

Prettier formats `.ts`, `.js`, `.svelte`, `.css`, `.json`, `.md`, and (via plugin) `.svelte`. Configuration is intentionally minimal — the whole point of Prettier is that there's nothing to argue about:

```jsonc
// web/.prettierrc
{
	"useTabs": true,
	"singleQuote": true,
	"trailingComma": "none",
	"printWidth": 100,
	"plugins": ["prettier-plugin-svelte"],
	"overrides": [{ "files": "*.svelte", "options": { "parser": "svelte" } }],
}
```

Tabs over spaces because the project's existing TS files use tabs (see `web/svelte.config.js`, `vite.config.ts`); Prettier matches.

```bash
cd web
pnpm format         # rewrite in place
pnpm format:check   # verify (used in CI)
```

The editor should run Prettier on save (the `.vscode/settings.json` checked into the repo enables this for VS Code). Files committed to the repo are always formatted; the pre-commit hook enforces this.

## SQL

We have hand-written SQL in three places: `db/migrations/`, `db/seed/`, and `db/tests/`. All three are linted and formatted with [SQLFluff](https://sqlfluff.com/), Postgres dialect.

### Why SQLFluff

It is the only SQL linter we evaluated that handles Postgres-specific syntax (`DO`, `CREATE POLICY`, `INHERIT`, `DOMAIN`) without choking, and it is the only formatter that gets within a respectful distance of how a human would format complex CTEs and policy bodies. The `pgFormatter` alternative is faster but more opinionated and doesn't lint; SQLFluff does both.

### Configuration

```ini
# .sqlfluff
[sqlfluff]
dialect = postgres
exclude_rules = L016,L034    ; line length and ordering — too aggressive for migrations
max_line_length = 100

[sqlfluff:indentation]
indent_unit = space
tab_space_size = 2

[sqlfluff:rules:capitalisation.keywords]
capitalisation_policy = upper

[sqlfluff:rules:capitalisation.identifiers]
extended_capitalisation_policy = lower
```

Spaces (not tabs) for SQL because every Postgres tool ever invented assumes spaces, and SQL is read in `psql` and pgAdmin and `pg_dump` output far more than it's read in our editor.

### Running

```bash
sqlfluff lint db/        # check
sqlfluff fix db/         # auto-fix
sqlfluff format db/      # format only (a subset of fix)
```

SQLFluff is a Python tool. Install via `pipx install sqlfluff` so it doesn't pollute the system Python. The pre-commit hook expects it on `PATH`.

### What we accept and what we don't

We accept some friction here: SQLFluff occasionally has opinions about whitespace inside `CREATE POLICY` bodies that produce diffs no human would have made. When that happens, we tag the offending statement with `-- noqa: <rule>` rather than disabling the rule globally. Per-line opt-outs are reviewable; global disables decay.

What we don't accept: hand-written SQL that doesn't pass `sqlfluff lint`. The CI will fail; fix the lint or add the targeted noqa.

## Shell

### Lint with ShellCheck

Every script in `scripts/` and any inline shell in CI configs gets ShellChecked. ShellCheck catches the classic shell mistakes (unquoted variables, `[ $x = ]` instead of `[ "$x" = "" ]`, subshell-in-loop-eats-stdin) that survive code review because shell is read like prose.

```bash
shellcheck scripts/*.sh
```

All scripts start with `#!/usr/bin/env bash` and `set -euo pipefail` (already true of the existing `migrate.sh`, `seed.sh`, `smoke.sh`). ShellCheck's `SC2086` (unquoted variables) is treated as an error, not a warning.

### Format with shfmt

shfmt is the gofmt of shell scripts: opinionated, fast, no configuration to argue about. We use:

```bash
shfmt -i 2 -ci -bn -w scripts/
```

(`-i 2` two-space indent, `-ci` indent case branches, `-bn` `&&` and `||` on next line, `-w` write in place.)

Both ShellCheck and shfmt are single static binaries. Install via your package manager; the pre-commit hook expects them on `PATH`.

## Editor baseline (`.editorconfig`)

`.editorconfig` is a tiny file at the repo root that almost every editor reads automatically. It encodes the indentation conventions per language, so a contributor's editor doesn't fight Prettier/shfmt/SQLFluff:

```ini
# .editorconfig
root = true

[*]
charset = utf-8
end_of_line = lf
insert_final_newline = true
trim_trailing_whitespace = true

[*.{ts,js,svelte,css,json,md}]
indent_style = tab

[*.sql]
indent_style = space
indent_size = 2

[*.sh]
indent_style = space
indent_size = 2
```

This is a defence in depth — the formatters would catch a wrong indent on commit, but `.editorconfig` prevents the wrong indent from being typed in the first place, so the editor's status bar never disagrees with the formatter's output.

## VS Code defaults

`.vscode/settings.json` (committed; per-user overrides go in the gitignored `.vscode/settings.json.local`) wires the editor to the toolchain:

```jsonc
{
	"editor.formatOnSave": true,
	"editor.defaultFormatter": "esbenp.prettier-vscode",
	"[svelte]": { "editor.defaultFormatter": "svelte.svelte-vscode" },
	"[sql]": { "editor.defaultFormatter": "dorzey.vscode-sqlfluff" },
	"[shellscript]": { "editor.defaultFormatter": "foxundermoon.shell-format" },
	"eslint.validate": ["javascript", "typescript", "svelte"],
	"eslint.experimental.useFlatConfig": true,
	"files.trimTrailingWhitespace": true,
	"files.insertFinalNewline": true,
}
```

`.vscode/extensions.json` recommends the matching extensions, so a fresh-clone contributor gets a one-click install of everything that makes the editor experience match CI.

Other editors are equally fine. Anything with LSP support reads the same configs (`tsconfig.json`, `eslint.config.js`, `.prettierrc`, `.editorconfig`, `.sqlfluff`) and behaves the same way.

## Pre-commit hook with lefthook

We use [lefthook](https://github.com/evilmartians/lefthook) to wire the toolchain into Git. Lefthook is a single static binary (Go), reads one YAML config, and handles polyglot repos cleanly — which matters because pre-commit-the-Python-tool would force Python on every contributor for an accidental reason, and Husky would lock us into Node-only hooks.

Practically, we ship lefthook as a `web/` `devDependency`. The npm package wraps a per-platform binary that pnpm fetches automatically as an optional dependency, so contributors don't need a separate system install. (We considered a Fedora COPR / Homebrew install, but the COPR is no longer published and the cross-distro story for "single binary on `PATH`" turned out to be more friction than the npm package.)

```yaml
# lefthook.yml
pre-commit:
  parallel: true
  commands:
    eslint:
      glob: "web/**/*.{ts,js,svelte}"
      run: cd web && pnpm exec eslint {staged_files}
    prettier:
      glob: "web/**/*.{ts,js,svelte,css,json,md}"
      run: cd web && pnpm exec prettier --check {staged_files}
    svelte-check:
      glob: "web/**/*.{ts,svelte}"
      run: cd web && pnpm exec svelte-check --tsconfig ./tsconfig.json
    sqlfluff:
      glob: "db/**/*.sql"
      run: sqlfluff lint {staged_files}
    shellcheck:
      glob: "scripts/**/*.sh"
      run: shellcheck {staged_files}
    shfmt:
      glob: "scripts/**/*.sh"
      run: shfmt -d -i 2 -ci -bn {staged_files}

pre-push:
  commands:
    test-db:
      run: ./scripts/test-db.sh
    vitest:
      run: cd web && pnpm test --run
```

`pre-commit` runs on staged files only — fast, fails early. `pre-push` runs the slower test suites once before the push goes out. Neither runs Playwright; that's CI-only because Playwright wants the whole stack up.

### Installing the hooks

Hooks are registered automatically by `web/package.json`'s `prepare` script, which runs at the end of every `pnpm install`. A fresh clone goes:

```bash
cd web && pnpm install
# → "sync hooks: ✔️ (pre-commit, pre-push)"
```

To register manually (e.g. after a hand-edit to `lefthook.yml`):

```bash
cd web && pnpm exec lefthook install
```

We considered keeping the install manual to avoid silently registering hooks during `pnpm install`. The countervailing argument won: a contributor who clones, runs `pnpm install`, and never reads the README still gets the linters fired on their first commit, instead of bypassing the gauntlet for weeks because the manual step was missed. Re-running `lefthook install` overwrites hooks unconditionally, so a developer who has hand-customized `.git/hooks/` will have those overwritten — a real but narrow risk for this project's audience.

### Bypassing the hook

```bash
git commit --no-verify
```

Reserved for genuine emergencies (a hotfix while a tool is broken upstream). The CI runs all the same checks, so a `--no-verify` commit will fail in CI anyway — it just defers the failure by a few minutes. Don't make it a habit.

## A single command to check everything

```bash
./scripts/check.sh
```

Runs the same gauntlet CI runs, in the same order, on the whole tree:

1. `cd web && pnpm install --frozen-lockfile`
2. `pnpm check` (svelte-check)
3. `pnpm lint` (eslint)
4. `pnpm format:check` (prettier)
5. `sqlfluff lint db/`
6. `shellcheck scripts/*.sh`
7. `shfmt -d -i 2 -ci -bn scripts/`
8. `./scripts/test-db.sh` (pgTAP — see `testing.md`)
9. `cd web && pnpm test --run` (vitest)

Run this before opening a PR. If it passes, CI passes; if it fails, CI was about to. The whole thing finishes in well under a minute on a laptop.

E2E (Playwright) is not in the default run because it requires the full stack up and downloads ~500 MB of browser binaries. Pass `--e2e` to append it (intended as a pre-PR check, not a per-task one), or run it separately with `cd web && pnpm test:e2e`:

```bash
./scripts/check.sh --e2e
```

## CI

CI runs `check.sh` plus E2E. The choice of host (GitHub Actions, Forgejo Actions, GitLab CI, a Hetzner runner) is deliberately not dictated here — the pipeline is a shell script and any Docker-capable runner can execute it. See `testing.md` → "CI" for the full ordered list.

The discipline that matters is not which CI we use; it's that **CI runs the same commands a developer runs**. No special CI-only steps, no commands defined twice. If the developer can't reproduce a CI failure locally, the pipeline is wrong.

## When tools disagree

Tools occasionally fight each other. The resolution order, when they do:

1. **Type checker wins over lint.** If `svelte-check` says it's a type error, it's a type error; an ESLint rule that contradicts is the one to disable.
2. **Prettier wins over ESLint stylistic rules.** That's why `eslint-config-prettier` is loaded last.
3. **shfmt wins over personal taste in shell.** It is gofmt for shell; treat it the same way.
4. **SQLFluff loses to a per-line `noqa` when its formatting is genuinely worse than what was there.** A targeted comment on one statement is fine; turning off a rule globally is not.

These almost never come up in practice. When they do, the goal is "one tool owns this concern," not "every tool agrees."

## Adding a new tool

Before adding a new linter, formatter, or checker, ask: does this catch a class of bug the existing tools don't? "It's nicer" or "the team I came from used it" aren't sufficient. Each tool has an ongoing cost — config to maintain, CI time, contributor onboarding, version drift — and the toolchain above is already at the upper end of what a small project should carry.

The bar for adding: a real defect that slipped past the existing tools, that the new tool would have caught, and that we expect to recur. If that's true, write a one-line note in this doc explaining what the new tool catches that the others don't.
