# Installer omnimail-mcp dans votre assistant IA

## Sommaire

- [Local ou distant ?](#local-ou-distant-)
- [Claude Code](#claude-code)
- [Claude Desktop](#claude-desktop)
- [Claude.ai (web et mobile)](#claudeai-web-et-mobile)
- [ChatGPT](#chatgpt)
- [Perplexity](#perplexity)
- [Marketplaces et annuaires](#marketplaces-et-annuaires)

> **Statut** : procédures cibles. Elles seront testées, datées et illustrées de captures en phase 7 (`docs/tutoriels/`). Les menus des clients IA changent souvent : chaque tutoriel indique la date de la dernière vérification.

## Local ou distant ?

| Client | Local (stdio, Docker sur votre machine) | Distant (`https://mcp.benmacha.tn/mcp`) |
|---|---|---|
| Claude Code | ✔ | ✔ |
| Claude Desktop | ✔ | ✔ (via connecteurs) |
| Claude.ai web / mobile | ✘ | ✔ |
| ChatGPT | ✘ | ✔ (mode développeur / apps) |
| Perplexity | ✔ app Mac (à vérifier) | à vérifier selon l'offre |

## Claude Code

**Local (Docker) :**

```bash
claude mcp add omnimail -- docker run -i --rm -v omnimail-data:/data ghcr.io/benmacha/omnimail-mcp:latest
```

**Distant :**

```bash
claude mcp add --transport http omnimail https://mcp.benmacha.tn/mcp
# puis /mcp dans Claude Code pour se connecter (OAuth)
```

**Via la marketplace de ce dépôt (plugin avec skills incluses) :**

```text
/plugin marketplace add BenMacha/omnimail-mcp
/plugin install omnimail@omnimail
```

## Claude Desktop

- **Extension `.mcpb`** : télécharger `omnimail.mcpb` depuis les *Releases* GitHub → double-clic → Claude Desktop l'installe.
- **Ou** configuration manuelle (`claude_desktop_config.json`) :

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

## Claude.ai (web et mobile)

1. Paramètres → **Connecteurs** → *Ajouter un connecteur personnalisé*.
2. URL : `https://mcp.benmacha.tn/mcp`.
3. *Se connecter* → page omnimail (passkey / lien magique) → consentement.
4. Dans une conversation, activer le connecteur depuis le menu des outils.

Sur les offres Team / Enterprise, c'est un administrateur qui ajoute le connecteur pour l'organisation.

## ChatGPT

1. Paramètres → **Applications et connecteurs** → *Avancé* → activer le **mode développeur** (offres payantes).
2. *Créer* un connecteur : nom `omnimail`, URL `https://mcp.benmacha.tn/mcp`, authentification OAuth.
3. Dans une conversation, choisir le connecteur dans le menu « + ».
4. ChatGPT demande confirmation avant les actions d'écriture.

Une publication dans l'annuaire d'apps ChatGPT est envisagée en phase 7.

## Perplexity

- **App Mac** : prise en charge des serveurs MCP locaux (via le connecteur d'aide « PerplexityXPC » à installer) — commande Docker identique à Claude Desktop.
- **Connecteurs distants** : selon l'offre ; à vérifier en phase 7.

## Marketplaces et annuaires

| Canal | Lien / procédure |
|---|---|
| Marketplace Claude Code | `/plugin marketplace add BenMacha/omnimail-mcp` (dépôt GitHub = marketplace) |
| Registre MCP officiel | `registry.modelcontextprotocol.io` — publication avec `mcp-publisher` (nom `io.github.benmacha/omnimail-mcp`) |
| Catalogue Docker MCP | pull request sur `github.com/docker/mcp-registry` |
| Extension Claude Desktop | fichier `.mcpb` dans les Releases, puis soumission à l'annuaire Anthropic |
| Annuaire connecteurs Claude.ai | formulaire de soumission Anthropic (serveur distant + OAuth + politique de confidentialité) |
| ChatGPT | soumission d'app via la plateforme développeurs OpenAI |

Les soumissions qui passent par un formulaire seront faites par Dali ; ce dépôt fournira les textes et visuels prêts à coller.
