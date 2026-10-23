# Politique de sécurité

## Signaler une vulnérabilité

Merci de **ne pas ouvrir d'issue publique**. Utilisez l'onglet *Security → Report a vulnerability* de ce dépôt GitHub (signalement privé).

Engagements : accusé de réception sous 72 h, évaluation sous 7 jours, correctif et publication coordonnée.

## Périmètre

- Code de ce dépôt et images `ghcr.io/benmacha/omnimail-mcp`.
- Instance hébergée `mcp.benmacha.tn` / `omnimail.benmacha.tn` (une fois en service).

Hors périmètre : déni de service, ingénierie sociale, tests sur des boîtes mail qui ne vous appartiennent pas.

## Principes

- Aucun secret en clair (code, logs, `.env`, sauvegardes).
- Mots de passe d'application ou OAuth uniquement, jamais le mot de passe principal.
- Actions sensibles derrière un plan et une confirmation ; défense contre l'injection de prompt (voir [docs/ARCHITECTURE.md §7](docs/ARCHITECTURE.md#7-sécurité-face-à-linjection-de-prompt)).
- Images Docker minimales, utilisateur non root, système de fichiers en lecture seule quand c'est possible, scan Trivy et SBOM en CI.
