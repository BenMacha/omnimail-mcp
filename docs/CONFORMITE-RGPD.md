# Conformité RGPD / CNIL

## Sommaire

- [1. Qui est responsable de quoi](#1-qui-est-responsable-de-quoi)
- [2. Données traitées](#2-données-traitées)
- [3. Bases légales et finalités](#3-bases-légales-et-finalités)
- [4. Principes appliqués](#4-principes-appliqués)
- [5. Stockage des identifiants](#5-stockage-des-identifiants)
- [6. Durées de conservation](#6-durées-de-conservation)
- [7. Droits des personnes](#7-droits-des-personnes)
- [8. Sous-traitants et transferts](#8-sous-traitants-et-transferts)
- [9. Documents à produire avant le mode hébergé](#9-documents-à-produire-avant-le-mode-hébergé)
- [10. Cas des correspondants](#10-cas-des-correspondants)
- [11. Tunisie](#11-tunisie)

> Ce document est un cadre de conception, pas un avis juridique. Il devra être relu par un juriste / DPO avant l'ouverture du mode hébergé au public.

## 1. Qui est responsable de quoi

| Mode | Responsable de traitement | Rôle d'omnimail |
|---|---|---|
| Local / auto-hébergé | l'utilisateur lui-même (souvent exemption domestique, art. 2.2.c RGPD) | simple logiciel, aucun traitement par l'éditeur |
| Hébergé `benmacha.tn` | l'utilisateur pour le contenu de ses mails ; l'éditeur pour la gestion des comptes du service | **sous-traitant** (art. 28) pour la boîte mail, **responsable** pour les données de compte |
| Fournisseur IA (Anthropic, OpenAI, Perplexity) | choisi et contracté par l'utilisateur | omnimail transmet les extraits demandés par l'IA, rien de plus |

## 2. Données traitées

| Catégorie | Exemples | Stockée ? |
|---|---|---|
| Compte du service | e-mail de connexion, passkey (clé publique) | oui (hébergé) |
| Identifiants mail | mots de passe d'application, jetons OAuth | oui, **chiffrés** |
| Métadonnées techniques | état de connexion, dates de synchronisation | oui |
| Contenu des mails | objet, corps, pièces jointes | **non par défaut** (lu à la demande) ; cache optionnel chiffré |
| Archives | EML/MBOX | uniquement si l'utilisateur active l'archivage, à l'emplacement qu'il choisit |
| Journal d'audit | outil utilisé, nombre d'éléments, date | oui, sans contenu de mail |

Des données sensibles (santé, opinions…) peuvent se trouver dans les mails : raison supplémentaire de ne pas les stocker.

## 3. Bases légales et finalités

| Finalité | Base légale |
|---|---|
| Fournir le service (lecture, organisation, réponse) | exécution du contrat (art. 6.1.b) |
| Archivage planifié, alertes | exécution du contrat, option activée par l'utilisateur |
| Sécurité, journaux, prévention des abus | intérêt légitime (art. 6.1.f) |
| Statistiques d'usage anonymes | consentement (désactivé par défaut) |

Pas de publicité, pas de revente, **pas d'entraînement de modèle** sur les données.

## 4. Principes appliqués

- **Minimisation** : pas de copie des mails ; périmètres OAuth les plus étroits possibles ; mode « lecture seule » proposé.
- **Protection dès la conception et par défaut** (art. 25) : envoi et suppression désactivés tant que l'utilisateur ne les active pas.
- **Sécurité** (art. 32) : TLS partout, chiffrement au repos, chiffrement par enveloppe, rotation des clés, moindre privilège des conteneurs, mises à jour, scan des images, journaux sans secrets.
- **Transparence** : politique de confidentialité claire, journal d'audit visible par l'utilisateur.
- **Violation de données** : procédure de notification CNIL sous 72 h (art. 33) et information des personnes (art. 34).
- **Cookies** : uniquement techniques (session) → pas de bandeau requis ; aucun traceur tiers.

## 5. Stockage des identifiants

Voir [PLAN.md §6](PLAN.md#6-stockage-des-identifiants--la-décision). Résumé :

- local : coffre chiffré sur la machine de l'utilisateur ;
- hébergé : chiffrement par enveloppe (DEK par utilisateur, KEK hors base), déchiffrement en mémoire uniquement au moment de la connexion ;
- jamais en clair dans un fichier `.env`, un log, un message d'erreur ou une sauvegarde non chiffrée ;
- recommandations CNIL sur les mots de passe respectées pour l'authentification au service (de préférence passkeys).

## 6. Durées de conservation

| Donnée | Durée |
|---|---|
| Compte et identifiants | tant que le compte est actif ; effacement immédiat à la suppression |
| Comptes inactifs | alerte à 12 mois, suppression à 24 mois |
| Journal d'audit | 12 mois |
| Journaux techniques | 6 mois maximum |
| Cache de recherche | 30 jours par défaut, configurable, purgeable |
| Sauvegardes | 30 jours glissants |
| Archives | décidé par l'utilisateur (stockage qu'il contrôle) |

## 7. Droits des personnes

Depuis le tableau de bord : **accès / portabilité** (export JSON), **rectification**, **effacement** (suppression du compte + révocation des jetons), **retrait du consentement**, **opposition**. Contact : adresse dédiée (à définir, ex. `privacy@benmacha.tn`). Réponse sous un mois. Droit de réclamation auprès de la CNIL rappelé.

## 8. Sous-traitants et transferts

| Sous-traitant | Usage | Localisation | Point d'attention |
|---|---|---|---|
| Hébergeur (ex. OVH) | serveurs | France / UE | contrat art. 28 |
| Cloudflare | DNS, tunnel, WAF | mondial | trafic chiffré transitant par Cloudflare ; clauses contractuelles types / Data Privacy Framework |
| Fournisseurs mail | accès aux boîtes | selon le fournisseur | choisi par l'utilisateur |
| Fournisseur IA | traitement des extraits | selon le fournisseur | choisi par l'utilisateur, à mentionner dans la politique |

## 9. Documents à produire avant le mode hébergé

- [ ] Registre des traitements (art. 30)
- [ ] **AIPD / DPIA** (art. 35) — correspondance privée à grande échelle, données potentiellement sensibles : très probablement obligatoire (outil PIA de la CNIL)
- [ ] Politique de confidentialité
- [ ] Conditions générales d'utilisation
- [ ] Contrat de sous-traitance (DPA) proposé aux utilisateurs professionnels
- [ ] Procédure de gestion des violations de données
- [ ] Mentions légales (éditeur, hébergeur)
- [ ] Politique de sécurité et divulgation responsable ([SECURITY.md](../SECURITY.md))

## 10. Cas des correspondants

Les personnes qui écrivent à l'utilisateur n'ont pas de relation avec omnimail. Leurs données ne sont traitées que pour le compte de l'utilisateur, sans stockage par défaut, sans profilage ni enrichissement.

## 11. Tunisie

Le domaine est en `.tn`. Si l'éditeur ou l'hébergement est en Tunisie, la loi organique n° 2004-63 sur la protection des données personnelles et l'INPDP s'appliquent aussi (déclarations, transferts). Recommandation : éditeur et hébergement dans l'UE pour simplifier, à confirmer par Dali.
