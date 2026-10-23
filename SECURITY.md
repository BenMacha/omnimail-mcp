# Security policy

## Reporting a vulnerability

Please **do not open a public issue**. Use *Security → Report a vulnerability* on this repository (private report).

We acknowledge within 72 hours, assess within 7 days, then fix and disclose in coordination with you.

## Scope

- The code in this repository and the `ghcr.io/benmacha/omnimail-mcp` images.
- The official hosted instance, once it exists.

Out of scope: denial of service, social engineering, tests on mailboxes you do not own.

## Principles

- No secret in clear text (code, logs, `.env`, backups); accounts live in an AES-256-GCM vault.
- App passwords or OAuth only, never the account's main password.
- Bulk and destructive actions require a plan and a confirmation token; e-mail content is passed to the AI as untrusted data (prompt-injection defence).
- Unsubscribe requests only reach public https URLs (SSRF protection).
- Minimal non-root Docker image, read-only filesystem, no Linux capabilities; Trivy scan, CodeQL and SBOM in CI.
