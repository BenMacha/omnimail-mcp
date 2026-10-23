<p align="center">
  <img src="assets/logo-wordmark.svg" alt="omnimail MCP" width="640">
</p>

<p align="center">
  <b>English</b> · <a href="README.fr.md">Français</a> · <a href="README.ar.md">العربية</a>
</p>

<p align="center">
  <a href="https://github.com/BenMacha/omnimail-mcp/actions/workflows/ci.yml"><img src="https://github.com/BenMacha/omnimail-mcp/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://github.com/BenMacha/omnimail-mcp/actions/workflows/codeql.yml"><img src="https://github.com/BenMacha/omnimail-mcp/actions/workflows/codeql.yml/badge.svg" alt="CodeQL"></a>
  <img src="https://img.shields.io/badge/license-AGPL--3.0-blue" alt="License AGPL-3.0">
  <img src="https://img.shields.io/badge/node-%E2%89%A520-339933" alt="Node ≥ 20">
  <img src="https://img.shields.io/badge/MCP-stdio%20%7C%20HTTP-4338CA" alt="MCP stdio | HTTP">
</p>

**omnimail** is an open-source **MCP** (Model Context Protocol) server that connects **all your mailboxes** — iCloud, Gmail, Yahoo, Infomaniak, Proton and any IMAP server — to your AI assistant: **Claude Code, Claude Desktop, Claude.ai, ChatGPT, Perplexity**.

Search every account at once, spot recurring senders and unsubscribe, sort into sub-folders (and undo it), clean up, detect scams, draft replies — while keeping control of your data.

> **Status: 0.1.0 — working local version.** Outlook / OAuth, hosted mode and scheduled archiving are on the [roadmap](docs/PLAN.md).

## Contents

- [Features](#features)
- [Install](#install)
- [Add your accounts](#add-your-accounts)
- [Example requests](#example-requests)
- [Providers](#providers)
- [Settings](#settings)
- [Security and privacy](#security-and-privacy)
- [Development](#development)
- [License](#license)

## Features

| Area | MCP tools |
|---|---|
| Accounts | `accounts_list`, `account_status` (connection OK, or why it failed) |
| Reading | `mail_search` (all accounts in parallel), `mail_get`, `attachment_get`, `folders_list` |
| Recurring senders | `recurring_senders_list`: volume, frequency, read rate, unsubscribe method |
| Unsubscribe | `unsubscribe_plan`: RFC 8058 one-click or mailto unsubscribe, and filing of past messages |
| Sorting | `classify_plan`: sub-folders by category (invoices, banking, orders, travel, newsletters…), by sender or by custom rules |
| Cleanup | `cleanup_plan`: archive or trash by category, sender, age, size |
| Plans | `plan_apply` (after approval), `plan_undo` (revert / unsort), `plans_list` |
| Organizing | `mail_move`, `mail_mark` (read, flagged) |
| Spam & scams | `spam_check`: SPF / DKIM / DMARC, spoofing, deceptive links, dangerous attachments, fake bank-detail changes |
| Replies | `draft_create`, `draft_reply`, `mail_send` (off by default) |
| Tracking | `audit_log`, `settings_get` |

**Every bulk change goes through a plan**: omnimail shows what it is about to do, you approve, then `plan_apply` runs it. Every plan can be **undone** for 30 days with `plan_undo` (except unsubscribes, by nature).

Bundled MCP prompts and Claude Code skills: `morning-triage`, `newsletter-cleanup`, `sort-into-folders`, `deep-cleanup`, `scam-detector`, `pending-replies`.

## Install

Requirement: Docker.

**Claude Code — from this repository's marketplace (recommended)**

```text
/plugin marketplace add BenMacha/omnimail-mcp
/plugin install omnimail@omnimail
```

**Claude Code — direct command**

```bash
claude mcp add omnimail -- docker run -i --rm -v omnimail-data:/data ghcr.io/benmacha/omnimail-mcp:latest
```

**Claude Desktop, Perplexity (Mac) and other stdio clients**

```json
{
  "mcpServers": {
    "omnimail": {
      "command": "docker",
      "args": ["run", "-i", "--rm", "-v", "omnimail-data:/data", "ghcr.io/benmacha/omnimail-mcp:latest"]
    }
  }
}
```

**Clients that need a URL (Claude.ai, ChatGPT)**

```bash
OMNIMAIL_HTTP_TOKEN=$(openssl rand -hex 24) docker compose --profile http up -d
# → http://127.0.0.1:3333/mcp with header Authorization: Bearer <token>
```

Public HTTPS exposure with OAuth sign-in for Claude.ai and ChatGPT comes in phase 5; until then this mode is for local use or behind your own HTTPS proxy. Per-client details (in French): [docs/CLIENTS.md](docs/CLIENTS.md).

## Add your accounts

```bash
docker run -it --rm -v omnimail-data:/data ghcr.io/benmacha/omnimail-mcp:latest accounts add
docker run -it --rm -v omnimail-data:/data ghcr.io/benmacha/omnimail-mcp:latest accounts test
```

The wizard detects the provider from the address, tells you where to create an **app password**, hides what you type and tests the connection before saving. Other commands: `accounts list`, `accounts remove <id>`, `providers`, `settings get|set`.

To keep the encryption key out of the data volume (recommended), use the `omnimail_master_key` Docker secret from `docker-compose.yml`, or `OMNIMAIL_MASTER_KEY_FILE`.

## Example requests

- "Which senders write to me the most and I never read? Unsubscribe me from the top five and file their past messages in a folder."
- "Sort my iCloud inbox into sub-folders by category." … then "Actually, undo it."
- "Archive notifications and social-network messages I read more than six months ago, in all my accounts."
- "Is this 'PayPal' e-mail a scam?"
- "Find the September electricity invoice and draft a reply to customer service."

## Providers

| Provider | Sign-in | Status |
|---|---|---|
| iCloud Mail | app password | ✅ |
| Gmail / Google Workspace | app password (OAuth in phase 4) | ✅ |
| Yahoo, AOL | app password | ✅ |
| Infomaniak | password (app password with 2FA) | ✅ |
| Proton Mail | Proton Mail Bridge (Docker profile `proton`) | ✅ |
| Fastmail, Zoho, GMX, OVHcloud, any IMAP | IMAP/SMTP | ✅ |
| Outlook.com / Microsoft 365 | OAuth required by Microsoft | phase 4 |

## Settings

`omnimail settings set <key> <value>`

| Key | Default | Purpose |
|---|---|---|
| `sendEnabled` | `false` | Allow `mail_send` (also `OMNIMAIL_SEND_ENABLED=true`) |
| `language` | `en` | Language of the folders omnimail creates: `en`, `fr`, `ar` (e.g. `Sorted/Invoices`, `Classement/Factures`, `مرتب/الفواتير`) |
| `classifyRoot` | *(localized)* | Root folder for sorting |
| `maxActionsPerPlan` | `5000` | Maximum messages per plan |
| `planTtlMinutes` | `15` | How long a plan waits for approval |
| `searchLimitPerAccount` | `50` | Results per account and folder |

## Security and privacy

- **Never your main password**: app passwords only, revocable at the provider.
- Accounts are stored in an **encrypted vault** (AES-256-GCM, scrypt-derived key); no secret in `.env` files, logs or tool output.
- **No copy of your mail**: messages are read on demand; plans only keep references and Message-IDs.
- E-mail content is returned to the AI **marked as untrusted** (prompt-injection defence).
- Sending **off by default**; unsubscribe calls limited to public https links (SSRF protection); never permanent deletion.
- Local log of every action (`audit_log`); non-root container, read-only filesystem, no Linux capabilities.

GDPR / CNIL framework (in French): [docs/CONFORMITE-RGPD.md](docs/CONFORMITE-RGPD.md) · Security policy: [SECURITY.md](SECURITY.md).

## Development

```bash
npm ci
npm run check                               # lint (Biome) + types + unit tests with coverage
docker compose -f docker/compose.test.yml up -d
npm run test:integration                    # full journey against a real IMAP/SMTP server (GreenMail)
```

CI on GitHub Actions: lint, unit tests on Node 20 / 22 / 24 with coverage, end-to-end tests, Docker smoke test and Trivy scan, CodeQL, dependency review, image publishing to GHCR and releases from tags. See [CONTRIBUTING.md](CONTRIBUTING.md).

Design documents (in French): [plan](docs/PLAN.md) · [architecture](docs/ARCHITECTURE.md) · [tools](docs/OUTILS-MCP.md) · [providers](docs/FOURNISSEURS.md).

## License

[AGPL-3.0](LICENSE) — free to use, modify and self-host; a modified version offered as an online service must publish its source code.

---

<p align="center">
  <img src="assets/palestine-flag.svg" alt="Flag of Palestine" width="72"><br>
  <b>Free Palestine</b> 🇵🇸
</p>
