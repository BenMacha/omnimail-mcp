# Changelog

Format : [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/), versionnement [SemVer](https://semver.org/lang/fr/).

## [Unreleased]

### Added

- 151 unit tests with an in-memory IMAP fake (plans, undo, exclusions, search, drafts, unsubscribe, SSRF guard, CLI arguments, MCP server surface), coverage thresholds enforced (≈95 % lines).
- Biome lint and formatting, `npm run check`, `.editorconfig`, `.nvmrc`.
- GitHub Actions: lint and types, unit tests on Node 20 / 22 / 24 with coverage summary, end-to-end tests, Docker smoke test and Trivy scan, CodeQL, dependency review, tag-based releases; Dependabot; issue and pull-request templates; CODEOWNERS; code of conduct.
- Folder names in three languages (`language`: `en`, `fr`, `ar`); Arabic keywords for categorization and scam detection.
- Logo, wordmark and README in English, French and Arabic.

### Changed

- Code, tool descriptions, errors, MCP prompts and Claude Code skills are now in English. Parameter values renamed: `thenMove` `none|archive|trash|folder`, `mode` `category|sender`, `action` `trash|archive`, categories `security|invoices|banking|administration|travel|orders|social|newsletters|notifications`; plan statuses `pending|applied|undone|expired`.
- Default sorting root is `Sorted` (English), `Classement` (French) or `مرتب` (Arabic).

### Fixed

- Internationalized (punycode) sender domains were never flagged because the parser decodes them.
- Non-breaking spaces from HTML mails are normalized in `mail_get`.

## [0.1.0] - 2026-10-23

### Added

- Serveur MCP en stdio et en HTTP (Streamable HTTP, jeton Bearer obligatoire).
- Comptes IMAP/SMTP multi-fournisseurs (iCloud, Gmail, Yahoo, AOL, Infomaniak, Proton Mail Bridge, Fastmail, Zoho, GMX, OVHcloud, générique) dans un coffre chiffré AES-256-GCM.
- CLI : `accounts add|list|test|remove`, `providers`, `settings`.
- Recherche multi-comptes, lecture des mails et pièces jointes, dossiers, état des connexions.
- Détection des envois récurrents (List-Id, expéditeur, taux de lecture) et désabonnement RFC 8058 one-click ou mailto, avec protection SSRF.
- Classement en sous-dossiers par catégorie, par expéditeur ou par règles, et déclassement (`plan_undo`).
- Nettoyage vers l'archive ou la corbeille, annulable.
- Plans avec simulation, jeton de confirmation, exclusions et annulation pendant 30 jours.
- Analyse spam / hameçonnage (SPF, DKIM, DMARC, usurpation, liens, pièces jointes, changement de RIB).
- Brouillons, réponses, envoi désactivé par défaut ; journal d'audit.
- Prompts MCP et plugin Claude Code (skills) avec marketplace dans le dépôt ; fiche `server.json` pour le registre MCP.
- Image Docker non root, `docker-compose.yml` (profils cli, http, proton), CI GitHub Actions et publication sur GHCR.
- Tests unitaires et tests de bout en bout contre GreenMail.
- Phase 0 : README, plan, architecture (diagrammes de classes, séquences, états, données), fournisseurs, clients IA et marketplaces, cadre RGPD/CNIL, catalogue des outils MCP, politique de sécurité.

### Changed

- README recentré sur l'installation et l'usage ; mentions d'hébergement retirées en attendant le choix du nom de domaine.

