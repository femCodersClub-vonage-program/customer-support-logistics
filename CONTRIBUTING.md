# Contributing

This guide explains how we work: how we write issues, branches, commits and pull requests, and when a change is done. Following it keeps reviews focused on the code and means newcomers don't have to guess.

## Getting started

1. Follow the [README](README.md#requirements) to set up your machine: Node.js 22, `corepack enable` and `pnpm install`.
2. Read the docs in [`docs/`](docs/):
   - [Design](docs/design/): what users see.
   - [Architecture](docs/architecture/README.md): how the system is built.
   - [Architecture Decision Records](docs/adr/README.md): why we made each important technical decision.

## Language

Code, commits, issues, pull requests and docs are written in **English**. Team discussion (meetings, chat, review conversations) can be in Spanish.

## Issues

### Title

`[phase.number] Short imperative title`, for example `[0.6.9] Database access layer`.

### Sections

Use the **Feature** template when you create an issue. It has these sections:

| Section             | What goes in it                                      |
| ------------------- | ---------------------------------------------------- |
| Context             | Why this is needed now.                              |
| Scope               | What will be done, as a checklist.                   |
| Out of scope        | What will not be done, so nobody expects it.         |
| Acceptance criteria | How we check that the issue is done.                 |
| Dependencies        | Issues or decisions that must be finished first.     |
| References          | Files, docs, ADRs or links that help to do the work. |

Bugs use the **Bug** template: steps to reproduce, expected and actual behaviour, device/browser and screenshots.

### Labels

Every issue has **one phase label** and **one area label**.

| Type  | Labels                                                                                               |
| ----- | ---------------------------------------------------------------------------------------------------- |
| Phase | `phase-0`, `phase-1`, …                                                                              |
| Area  | `backend`, `frontend-client`, `frontend-crm`, `platform`, `design`, `documentation`, `accessibility` |

### Assignment

Assign yourself **before** you start working on an issue, so two people don't pick the same one.

## Branches

| Branch    | Purpose                     |
| --------- | --------------------------- |
| `main`    | What is released.           |
| `develop` | Integration of merged work. |

Nobody commits directly to `main` or `develop`.

Create work branches from `develop` and name them `<type>/<issue>-<short-name>`. `<type>` is a [commit type](#commits), and `<issue>` is the issue's phase number or its GitHub number:

- `feat/0.6.9-database-layer`
- `fix/23-sidenav-active`
- `docs/0.11-adr`

Keep branches short-lived. Rebase on `develop` (or merge `develop` into your branch) before you ask for a review.

## Commits

We use [Conventional Commits](https://www.conventionalcommits.org/), with the app or package as the scope:

```text
feat(api): add readiness endpoint
fix(client): keep the active item highlighted in the side nav
docs(adr): add ADR for the ORM
chore(config): enable strict mode in the base tsconfig
```

| Scope          | Area                           |
| -------------- | ------------------------------ |
| `api`          | `apps/api`                     |
| `client`       | `apps/client`                  |
| `crm`          | `apps/crm`                     |
| `shared-types` | `packages/shared-types`        |
| `api-client`   | `packages/api-client`          |
| `config`       | `packages/config`, root config |
| `docs`         | `docs/`, README, this guide    |
| `ci`           | `.github/workflows/`           |

## Pull requests

- **One pull request per issue**, opened against `develop`.
- **Title** in Conventional Commits format, for example `feat(api): add readiness endpoint`. Don't copy the issue title.
- **Body** follows the pull request template and says `Closes #N`. Because `develop` isn't the default branch, GitHub doesn't close the issue on merge: the author closes it by hand after the merge.
- **Keep it small.** If it's over ~400 changed lines (excluding the lockfile and generated files), consider splitting it.
- **Approvals:** at least one. A pull request that makes an architecture decision needs an ADR and two approvals (see the [ADR process](docs/adr/README.md#process)).
- **Merge strategy:** squash merge into `develop`, so each pull request becomes one commit.
- **Releases:** a maintainer opens a pull request from `develop` to `main` that groups several merged pull requests.

### Before opening a pull request

Run these checks locally:

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm format:check
pnpm build
```

CI ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)) runs lint, tests and build for each app, so a pull request that fails them can't be merged.

## Definition of done

A pull request is done when:

- the acceptance criteria of the issue are met;
- new logic has tests, and CI is green;
- UI changes include screenshots in the pull request, and keyboard navigation and colour contrast have been checked;
- docs are updated: README, the app's `.env.example`, and an ADR if a decision was made;
- no secrets are committed.

## Code review

**Reviewers**

- Be kind and specific. Comment on the code, not the person, and explain why you suggest a change.
- Prefix optional comments with `nit:`, so the author knows they don't block the merge.
- Approve when the remaining comments are only nits.

**Authors**

- Answer every comment, either with a change or with a reason.
- Resolve the conversations yourself once they're addressed.

## Secrets

- Never commit `.env` files, Vonage API keys or private keys (`*.key`).
- Each app has a `.env.example` (`apps/api`, `apps/client`, `apps/crm`) with placeholder values. When you add a variable, add it there too.

If a secret is committed, even on a branch that was never merged:

1. **Rotate it first**: revoke the key in the provider's dashboard (for example Vonage) and create a new one. Removing the commit is not enough, because the secret may already be copied.
2. Tell a maintainer.
3. Then remove it from the repository history.

## AI assistants

AI assistants are allowed.

- The author is responsible for every line in the pull request and must understand it.
- Don't paste secrets or `.env` contents into prompts.
- Project rules for assistants live in [`.claude/settings.json`](.claude/settings.json) and [`apps/crm/AGENTS.md`](apps/crm/AGENTS.md).
