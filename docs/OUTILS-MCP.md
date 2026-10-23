# Catalogue MCP : outils, prompts (skills), ressources

## Sommaire

- [Outils](#outils)
- [Prompts / skills](#prompts--skills)
- [Ressources](#ressources)
- [Idées de fonctions avancées](#idées-de-fonctions-avancées)

Légende : 👁 lecture seule · ✏️ modification réversible · ⚠️ sensible (plan + confirmation).

## Outils

| Outil | Type | Phase | Description |
|---|---|---|---|
| `accounts_list` | 👁 | 1 | Comptes configurés et leur état |
| `account_status` | 👁 | 1 | Santé détaillée d'un compte (connexion, quota, dernière synchro) |
| `folders_list` | 👁 | 1 | Dossiers / libellés avec compteurs |
| `mail_search` | 👁 | 1 | Recherche multi-comptes : texte, expéditeur, dates, pièce jointe, non lu, taille |
| `mail_get` | 👁 | 1 | Contenu d'un mail (texte, HTML nettoyé, en-têtes utiles) |
| `thread_get` | 👁 | 1 | Conversation complète |
| `attachment_get` | 👁 | 1 | Pièce jointe (texte extrait pour PDF / docx, sinon métadonnées) |
| `mailbox_stats` | 👁 | 3 | Top expéditeurs, volume, plus gros mails, non lus anciens |
| `draft_create` / `draft_reply` | ✏️ | 2 | Brouillon dans le bon compte |
| `mail_send` | ⚠️ | 2 | Envoi d'un brouillon, confirmation obligatoire |
| `mail_move` / `mail_archive` | ✏️ | 2 | Déplacement, archivage |
| `mail_flag` / `mail_mark_read` | ✏️ | 2 | Drapeaux, lu / non lu |
| `label_apply` / `folder_create` | ✏️ | 2 | Libellés (Gmail), catégories (Outlook), dossiers (IMAP) |
| `mail_trash` | ⚠️ | 2 | Mise en corbeille (jamais de suppression définitive par défaut) |
| `cleanup_plan` | 👁 | 3 | Simulation de nettoyage : newsletters, notifications, gros fichiers, doublons, ancien |
| `cleanup_apply` | ⚠️ | 3 | Exécution d'un plan validé, annulable |
| `cleanup_undo` | ✏️ | 3 | Annulation d'un plan exécuté |
| `newsletters_list` | 👁 | 3 | Abonnements détectés avec fréquence et taux de lecture |
| `unsubscribe` | ⚠️ | 3 | Désabonnement RFC 8058 (one-click) ou lien `mailto:` |
| `spam_score` | 👁 | 3 | Score et raisons : SPF/DKIM/DMARC, usurpation d'expéditeur, liens, Rspamd |
| `phishing_check` | 👁 | 3 | Analyse arnaque : domaine ressemblant, urgence, IBAN, pièce jointe exécutable |
| `rules_list` / `rule_create` | ✏️ | 3 | Règles de tri appliquées à la demande ou planifiées |
| `archive_export` | 👁 | 6 | Export EML / MBOX d'une sélection |
| `archive_schedule` | ✏️ | 6 | Archivage incrémental planifié |
| `notifications_configure` | ✏️ | 6 | Canaux d'alerte (e-mail, ntfy, webhook, Telegram) |
| `audit_log` | 👁 | 2 | Historique des actions effectuées via omnimail |

## Prompts / skills

Exposés comme **prompts MCP** (tous clients) et comme **skills** dans le plugin Claude Code.

| Nom | Ce que ça fait |
|---|---|
| `tri-du-matin` | Non lus des dernières 24 h, tous comptes : urgent / à répondre / info / bruit |
| `reponses-en-attente` | Mails auxquels je n'ai pas répondu depuis X jours, et ceux où j'attends une réponse |
| `menage-newsletters` | Liste les abonnements, propose désabonnement + archivage en un plan |
| `detecteur-arnaques` | Passe les mails récents au `phishing_check` et explique les signaux |
| `resume-semaine` | Synthèse de la semaine par compte et par thème |
| `boite-zero` | Plan pour atteindre « inbox zero » : archiver, classer, répondre |
| `factures-et-documents` | Retrouve factures, contrats, billets ; propose un classement |
| `grand-nettoyage` | Gros fichiers, doublons, notifications anciennes → plan |
| `audit-securite-comptes` | État des comptes, mots de passe d'app anciens, connexions en échec |

## Ressources

| URI | Contenu |
|---|---|
| `omnimail://accounts` | Liste des comptes (sans secrets) |
| `omnimail://account/{id}/folders` | Arborescence des dossiers |
| `omnimail://message/{account}/{id}` | Mail brut nettoyé |
| `omnimail://settings` | Réglages actifs (envoi activé ?, plafonds) |

## Idées de fonctions avancées

- **Vue unifiée** façon « boîte unique » avec étiquettes par compte.
- **Détection de doublons** entre comptes (même Message-ID reçu sur deux adresses).
- **Suivi des colis / réservations** extraits des mails.
- **Rappels** : « relance-moi si pas de réponse sous 3 jours ».
- **Migration** d'un fournisseur à un autre (copie IMAP → IMAP).
- **Règles apprises** : proposer une règle quand l'utilisateur répète le même tri.
- **Rapport hebdomadaire** envoyé par e-mail ou ntfy.
