# omnimail-mcp

> Un serveur **MCP** (Model Context Protocol) open source qui relie **toutes vos boîtes mail** — iCloud, Gmail, Yahoo, Infomaniak, Proton, et n'importe quel serveur IMAP — à votre assistant IA : **Claude Code, Claude Desktop, Claude.ai, ChatGPT, Perplexity**.
>
> Chercher dans tous les comptes à la fois, repérer les envois récurrents et s'en désabonner, ranger en sous-dossiers (et tout déclasser), nettoyer, détecter les arnaques, préparer des réponses — en gardant le contrôle de vos données (RGPD).

**Statut : 0.1.0, version locale fonctionnelle.** Voir [docs/PLAN.md](docs/PLAN.md) pour la suite (Outlook, OAuth, archivage planifié…).

---

## Sommaire

- [Ce que l'outil fait](#ce-que-loutil-fait)
- [Installation](#installation)
- [Ajouter vos comptes](#ajouter-vos-comptes)
- [Exemples de demandes](#exemples-de-demandes)
- [Fournisseurs pris en charge](#fournisseurs-pris-en-charge)
- [Sécurité et vie privée](#sécurité-et-vie-privée)
- [Développement](#développement)
- [Documentation](#documentation)
- [Licence](#licence)

---

## Ce que l'outil fait

| Domaine | Outils MCP |
|---|---|
| Comptes | `accounts_list`, `account_status` (connexion OK ou cause de l'échec) |
| Lecture | `mail_search` (tous les comptes en parallèle), `mail_get`, `attachment_get`, `folders_list` |
| Envois récurrents | `recurring_senders_list` : volume, fréquence, taux de lecture, méthode de désabonnement |
| Désabonnement | `unsubscribe_plan` : désabonnement one-click (RFC 8058) ou par mail, et rangement des anciens mails |
| Classement | `classify_plan` : sous-dossiers par catégorie (Factures, Banque, Commandes, Voyages, Newsletters…), par expéditeur ou par règles |
| Nettoyage | `cleanup_plan` : archive ou corbeille selon catégorie, expéditeur, ancienneté, taille |
| Plans | `plan_apply` (après accord), `plan_undo` (**déclasser** / annuler), `plans_list` |
| Organisation | `mail_move`, `mail_mark` (lu, important) |
| Spam & arnaques | `spam_check` : SPF / DKIM / DMARC, usurpation, liens trompeurs, pièces jointes dangereuses, faux changement de RIB |
| Réponses | `draft_create`, `draft_reply`, `mail_send` (désactivé par défaut) |
| Suivi | `audit_log`, `settings_get` |

**Toute modification en masse passe par un plan** : l'outil montre ce qu'il va faire, l'utilisateur valide, puis `plan_apply` exécute. Chaque plan est **annulable** pendant 30 jours avec `plan_undo` (sauf les désabonnements, par nature).

Prompts MCP et skills inclus : `tri-du-matin`, `menage-newsletters`, `classement-dossiers`, `grand-nettoyage`, `detecteur-arnaques`, `reponses-en-attente`.

## Installation

Prérequis : Docker.

### Claude Code — via la marketplace de ce dépôt (recommandé)

```text
/plugin marketplace add BenMacha/omnimail-mcp
/plugin install omnimail@omnimail
```

Le plugin installe le serveur MCP et les skills.

### Claude Code — commande directe

```bash
claude mcp add omnimail -- docker run -i --rm -v omnimail-data:/data ghcr.io/benmacha/omnimail-mcp:latest
```

### Claude Desktop, Perplexity (Mac), autres clients stdio

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

### Claude.ai, ChatGPT et clients qui demandent une URL

```bash
OMNIMAIL_HTTP_TOKEN=$(openssl rand -hex 24) docker compose --profile http up -d
# → http://127.0.0.1:3333/mcp, en-tête Authorization: Bearer <jeton>
```

L'exposition publique (HTTPS, connexion OAuth pour Claude.ai / ChatGPT) est prévue en phase 5 ; d'ici là, ce mode est destiné à un usage local ou derrière votre propre proxy HTTPS.

Détails par client : [docs/CLIENTS.md](docs/CLIENTS.md).

## Ajouter vos comptes

```bash
docker run -it --rm -v omnimail-data:/data ghcr.io/benmacha/omnimail-mcp:latest accounts add
docker run -it --rm -v omnimail-data:/data ghcr.io/benmacha/omnimail-mcp:latest accounts test
```

L'assistant détecte le fournisseur depuis l'adresse, indique où créer le **mot de passe d'application**, masque la saisie et teste la connexion avant d'enregistrer. Autres commandes : `accounts list`, `accounts remove <id>`, `providers`, `settings get|set`.

Pour mettre la clé de chiffrement hors du volume de données (recommandé) : `docker compose` avec le secret `omnimail_master_key`, ou la variable `OMNIMAIL_MASTER_KEY_FILE`.

## Exemples de demandes

- « Quels sont les expéditeurs qui m'écrivent le plus et que je ne lis jamais ? Désabonne-moi des cinq premiers et range leurs anciens mails dans un dossier. »
- « Classe ma boîte de réception iCloud en sous-dossiers par catégorie. » … puis « Finalement, déclasse tout. »
- « Archive les notifications et les réseaux sociaux lus de plus de six mois, sur tous mes comptes. »
- « Ce mail de "PayPal" est-il une arnaque ? »
- « Retrouve la facture EDF de septembre et prépare une réponse au service client. »

## Fournisseurs pris en charge

| Fournisseur | Connexion | État |
|---|---|---|
| iCloud Mail | mot de passe d'application | ✅ |
| Gmail / Google Workspace | mot de passe d'application (OAuth en phase 4) | ✅ |
| Yahoo, AOL | mot de passe d'application | ✅ |
| Infomaniak | mot de passe (d'application si 2FA) | ✅ |
| Proton Mail | Proton Mail Bridge (profil Docker `proton`) | ✅ |
| Fastmail, Zoho, GMX, OVHcloud, IMAP générique | IMAP/SMTP | ✅ |
| Outlook.com / Microsoft 365 | OAuth obligatoire chez Microsoft | phase 4 |

Détails : [docs/FOURNISSEURS.md](docs/FOURNISSEURS.md).

## Sécurité et vie privée

- **Jamais votre mot de passe principal** : uniquement des mots de passe d'application, révocables chez le fournisseur.
- Comptes stockés dans un **coffre chiffré** (AES-256-GCM, clé dérivée par scrypt) ; aucun secret dans un fichier `.env`, un journal ou une réponse d'outil.
- **Aucune copie des mails** : lecture à la demande, rien n'est stocké hors des plans (références et identifiants de messages uniquement).
- Le contenu des mails est renvoyé à l'IA **marqué comme non fiable** (protection contre l'injection de prompt).
- Envoi **désactivé par défaut** ; désabonnements limités aux liens https publics (protection SSRF) ; jamais de suppression définitive.
- Journal local de toutes les actions (`audit_log`).
- Conteneur non root, système de fichiers en lecture seule, aucune capacité Linux.

Détails : [docs/CONFORMITE-RGPD.md](docs/CONFORMITE-RGPD.md) et [SECURITY.md](SECURITY.md).

## Développement

```bash
npm ci
npm run build
npm test                                   # tests unitaires
docker compose -f docker/compose.test.yml up -d
npm run test:integration                   # parcours complet contre un vrai serveur IMAP/SMTP (GreenMail)
```

## Documentation

| Document | Contenu |
|---|---|
| [docs/PLAN.md](docs/PLAN.md) | Plan, phases, décisions |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Composants, diagrammes de classes, scénarios, états |
| [docs/OUTILS-MCP.md](docs/OUTILS-MCP.md) | Catalogue des outils, prompts et skills |
| [docs/FOURNISSEURS.md](docs/FOURNISSEURS.md) | Connexion à chaque fournisseur |
| [docs/CLIENTS.md](docs/CLIENTS.md) | Installation par client IA, marketplaces |
| [docs/CONFORMITE-RGPD.md](docs/CONFORMITE-RGPD.md) | RGPD, CNIL, stockage des identifiants |
| [docs/tutoriels/](docs/tutoriels/) | Tutoriels illustrés (à venir) |

## Licence

[AGPL-3.0](LICENSE) — libre d'utiliser, modifier et auto-héberger ; toute version modifiée proposée en service en ligne doit publier son code source.
