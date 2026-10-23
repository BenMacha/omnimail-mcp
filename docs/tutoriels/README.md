# Tutoriels illustrés

Les tutoriels seront produits en phase 7. Chacun indiquera la **date de vérification** et la version d'omnimail.

| Tutoriel | Statut |
|---|---|
| Créer un mot de passe d'application (iCloud, Gmail, Yahoo, Infomaniak) | à faire |
| Installer dans Claude Code (local / distant / marketplace) | à faire |
| Installer dans Claude Desktop (`.mcpb`) | à faire |
| Ajouter le connecteur dans Claude.ai | à faire |
| Ajouter le connecteur dans ChatGPT (mode développeur) | à faire |
| Utiliser avec Perplexity | à faire |
| Configurer l'archivage et les alertes | à faire |

## Génération des captures

- Service Docker `docs-screenshots` (Playwright + Chromium) : captures de l'interface omnimail et des étapes en terminal, régénérées à chaque version dans `img/`.
- Écrans des clients IA : session ouverte **par l'utilisateur lui-même** dans le navigateur du conteneur (noVNC). L'outil ne saisit jamais de mot de passe et ne conserve pas la session.
- Floutage automatique des zones sensibles avant commit.
