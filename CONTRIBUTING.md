# Contributing

Thanks for helping! Code, comments, tool descriptions and skills are written in **English**; user-facing READMEs exist in English, French and Arabic.

## Setup

```bash
npm ci
npm run check                                  # Biome lint + TypeScript + unit tests with coverage thresholds
docker compose -f docker/compose.test.yml up -d
npm run test:integration                       # end-to-end against GreenMail
```

`npm run format` fixes formatting and import order.

## Rules

- [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `docs:`, `test:`, `ci:`…), and update `CHANGELOG.md` in every pull request.
- Never put real credentials or real e-mails in tests: use `tests/helpers/fake-imap.ts` for unit tests and GreenMail for end-to-end tests.
- Every write tool needs MCP annotations; bulk or destructive changes must go through a plan (`*_plan` → `plan_apply` with the confirmation token) and be revertible with `plan_undo` when possible.
- E-mail content returned by a tool must stay wrapped as untrusted data.
- Coverage thresholds (lines/functions/statements 85 %, branches 75 %) are enforced in CI.
- Diagrams in documentation are Mermaid blocks.

## Releasing

1. Bump `version` in `package.json`, `server.json` and `src/server.ts`, move the `Unreleased` changelog entries under the new version.
2. Merge to `main`, then push a tag `vX.Y.Z`: the release workflow checks the versions and publishes the GitHub release; the publish workflow pushes the image to GHCR.
