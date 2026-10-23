<p align="center">
  <img src="assets/logo-wordmark.svg" alt="omnimail MCP" width="640">
</p>

<p align="center">
  <a href="README.md">English</a> · <b>Français</b> · <a href="README.ar.md">العربية</a>
</p>

<p align="center">
  <a href="https://github.com/BenMacha/omnimail-mcp/actions/workflows/ci.yml"><img src="https://github.com/BenMacha/omnimail-mcp/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://github.com/BenMacha/omnimail-mcp/actions/workflows/codeql.yml"><img src="https://github.com/BenMacha/omnimail-mcp/actions/workflows/codeql.yml/badge.svg" alt="CodeQL"></a>
  <img src="https://img.shields.io/badge/licence-AGPL--3.0-blue" alt="Licence AGPL-3.0">
  <img src="https://img.shields.io/badge/node-%E2%89%A520-339933" alt="Node ≥ 20">
  <img src="https://img.shields.io/badge/MCP-stdio%20%7C%20HTTP-4338CA" alt="MCP stdio | HTTP">
</p>

**omnimail** est un serveur **MCP** (Model Context Protocol) open source qui relie **toutes vos boîtes mail** — iCloud, Gmail, Yahoo, Infomaniak, Proton et n'importe quel serveur IMAP — à votre assistant IA : **Claude Code, Claude Desktop, Claude.ai, ChatGPT, Perplexity**.

Chercher dans tous les comptes à la fois, repérer les envois récurrents et s'en désabonner, ranger en sous-dossiers (et tout déclasser), nettoyer, détecter les arnaques, préparer des réponses — en gardant le contrôle de vos données.

> **Statut : 0.1.0, version locale fonctionnelle.** Outlook / OAuth, mode hébergé et archivage planifié sont au [plan](docs/PLAN.md).

## Sommaire

- [Fonctionnalités](#fonctionnalités)
- [Installation](#installation)
- [Ajouter vos comptes](#ajouter-vos-comptes)
- [Exemples de demandes](#exemples-de-demandes)
- [Fournisseurs](#fournisseurs)
- [Réglages](#réglages)
- [Sécurité et vie privée](#sécurité-et-vie-privée)
- [Développement](#développement)
- [Licence](#licence)

## Fonctionnalités

| Domaine | Outils MCP |
|---|---|
| Comptes | `accounts_list`, `account_status` (connexion OK ou cause de l'échec) |
| Lecture | `mail_search` (tous les comptes en parallèle), `mail_get`, `attachment_get`, `folders_list` |
| Envois récurrents | `recurring_senders_list` : volume, fréquence, taux de lecture, méthode de désabonnement |
| Désabonnement | `unsubscribe_plan` : désabonnement one-click (RFC 8058) ou par mail, et rangement des anciens mails |
| Classement | `classify_plan` : sous-dossiers par catégorie (factures, banque, commandes, voyages, newsletters…), par expéditeur ou par règles |
| Nettoyage | `cleanup_plan` : archive ou corbeille selon catégorie, expéditeur, ancienneté, taille |
| Plans | `plan_apply` (après accord), `plan_undo` (annuler / déclasser), `plans_list` |
| Organisation | `mail_move`, `mail_mark` (lu, important) |
| Spam & arnaques | `spam_check` : SPF / DKIM / DMARC, usurpation, liens trompeurs, pièces jointes dangereuses, faux changement de RIB |
| Réponses | `draft_create`, `draft_reply`, `mail_send` (désactivé par défaut) |
| Suivi | `audit_log`, `settings_get` |

**Toute modification en masse passe par un plan** : omnimail montre ce qu'il va faire, vous validez, puis `plan_apply` exécute. Chaque plan est **annulable** pendant 30 jours avec `plan_undo` (sauf les désabonnements, par nature).

Prompts MCP et skills Claude Code inclus : `morning-triage`, `newsletter-cleanup`, `sort-into-folders`, `deep-cleanup`, `scam-detector`, `pending-replies`. L'assistant vous répond dans votre langue.

## Installation

Prérequis : Docker.

**Claude Code — via la marketplace de ce dépôt (recommandé)**

```text
/plugin marketplace add BenMacha/omnimail-mcp
/plugin install omnimail@omnimail
```

**Claude Code — commande directe**

```bash
claude mcp add omnimail -- docker run -i --rm -v omnimail-data:/data ghcr.io/benmacha/omnimail-mcp:latest
```

**Claude Desktop, Perplexity (Mac) et autres clients stdio**

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

**Clients qui demandent une URL (Claude.ai, ChatGPT)**

```bash
OMNIMAIL_HTTP_TOKEN=$(openssl rand -hex 24) docker compose --profile http up -d
# → http://127.0.0.1:3333/mcp, en-tête Authorization: Bearer <jeton>
```

L'exposition publique en HTTPS avec connexion OAuth pour Claude.ai et ChatGPT arrive en phase 5 ; d'ici là, ce mode est destiné à un usage local ou derrière votre propre proxy HTTPS. Détails par client : [docs/CLIENTS.md](docs/CLIENTS.md).

## Ajouter vos comptes

```bash
docker run -it --rm -v omnimail-data:/data ghcr.io/benmacha/omnimail-mcp:latest accounts add
docker run -it --rm -v omnimail-data:/data ghcr.io/benmacha/omnimail-mcp:latest accounts test
```

L'assistant détecte le fournisseur depuis l'adresse, indique où créer le **mot de passe d'application**, masque la saisie et teste la connexion avant d'enregistrer. Autres commandes : `accounts list`, `accounts remove <id>`, `providers`, `settings get|set`.

Pour garder la clé de chiffrement hors du volume de données (recommandé) : secret Docker `omnimail_master_key` de `docker-compose.yml`, ou `OMNIMAIL_MASTER_KEY_FILE`.

## Exemples de demandes

- « Quels expéditeurs m'écrivent le plus sans que je les lise ? Désabonne-moi des cinq premiers et range leurs anciens mails dans un dossier. »
- « Classe ma boîte iCloud en sous-dossiers par catégorie. » … puis « Finalement, déclasse tout. »
- « Archive les notifications et les réseaux sociaux lus il y a plus de six mois, sur tous mes comptes. »
- « Ce mail de "PayPal" est-il une arnaque ? »
- « Retrouve la facture d'électricité de septembre et prépare une réponse au service client. »

## Fournisseurs

| Fournisseur | Connexion | État |
|---|---|---|
| iCloud Mail | mot de passe d'application | ✅ |
| Gmail / Google Workspace | mot de passe d'application (OAuth en phase 4) | ✅ |
| Yahoo, AOL | mot de passe d'application | ✅ |
| Infomaniak | mot de passe (d'application si 2FA) | ✅ |
| Proton Mail | Proton Mail Bridge (profil Docker `proton`) | ✅ |
| Fastmail, Zoho, GMX, OVHcloud, IMAP générique | IMAP/SMTP | ✅ |
| Outlook.com / Microsoft 365 | OAuth imposé par Microsoft | phase 4 |

Détails : [docs/FOURNISSEURS.md](docs/FOURNISSEURS.md).

## Réglages

`omnimail settings set <clé> <valeur>`

| Clé | Défaut | Rôle |
|---|---|---|
| `sendEnabled` | `false` | Autorise `mail_send` (aussi `OMNIMAIL_SEND_ENABLED=true`) |
| `language` | `en` | Langue des dossiers créés : `en`, `fr`, `ar` (ex. `Sorted/Invoices`, `Classement/Factures`, `مرتب/الفواتير`) |
| `classifyRoot` | *(selon la langue)* | Dossier racine du classement |
| `maxActionsPerPlan` | `5000` | Nombre maximal de mails par plan |
| `planTtlMinutes` | `15` | Durée de validité d'un plan avant accord |
| `searchLimitPerAccount` | `50` | Résultats par compte et par dossier |

Pour des dossiers en français : `omnimail settings set language fr`.

## Sécurité et vie privée

- **Jamais votre mot de passe principal** : uniquement des mots de passe d'application, révocables chez le fournisseur.
- Comptes stockés dans un **coffre chiffré** (AES-256-GCM, clé dérivée par scrypt) ; aucun secret dans un `.env`, un journal ou une réponse d'outil.
- **Aucune copie des mails** : lecture à la demande ; les plans ne gardent que des références et des Message-ID.
- Le contenu des mails est renvoyé à l'IA **marqué comme non fiable** (protection contre l'injection de prompt).
- Envoi **désactivé par défaut** ; désabonnements limités aux liens https publics (protection SSRF) ; jamais de suppression définitive.
- Journal local de toutes les actions (`audit_log`) ; conteneur non root, système de fichiers en lecture seule, aucune capacité Linux.

Cadre RGPD / CNIL : [docs/CONFORMITE-RGPD.md](docs/CONFORMITE-RGPD.md) · Politique de sécurité : [SECURITY.md](SECURITY.md).

## Développement

```bash
npm ci
npm run check                               # lint (Biome) + types + tests unitaires avec couverture
docker compose -f docker/compose.test.yml up -d
npm run test:integration                    # parcours complet contre un vrai serveur IMAP/SMTP (GreenMail)
```

CI GitHub Actions : lint, tests unitaires sur Node 20 / 22 / 24 avec couverture, tests de bout en bout, test rapide et scan Trivy de l'image Docker, CodeQL, revue des dépendances, publication de l'image sur GHCR et releases à partir des tags. Voir [CONTRIBUTING.md](CONTRIBUTING.md).

Documents de conception : [plan](docs/PLAN.md) · [architecture](docs/ARCHITECTURE.md) · [outils](docs/OUTILS-MCP.md) · [clients IA](docs/CLIENTS.md).

## Licence

[AGPL-3.0](LICENSE) — libre d'utiliser, modifier et auto-héberger ; toute version modifiée proposée en service en ligne doit publier son code source.

---

<p align="center">
  <img src="assets/palestine-flag.svg" alt="Drapeau de la Palestine" width="72"><br>
  <b>Free Palestine</b> 🇵🇸
</p>
