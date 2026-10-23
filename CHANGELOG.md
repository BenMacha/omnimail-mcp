# Changelog

Format : [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/), versionnement [SemVer](https://semver.org/lang/fr/).

## [Unreleased]

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

### Changed

- README recentré sur l'installation et l'usage ; mentions d'hébergement retirées en attendant le choix du nom de domaine.

### Added

- Phase 0 : README, plan, architecture (diagrammes de classes, séquences, états, données), fournisseurs, clients IA et marketplaces, cadre RGPD/CNIL, catalogue des outils MCP, politique de sécurité.
