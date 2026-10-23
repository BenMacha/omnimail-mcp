# Fournisseurs de messagerie

## Sommaire

- [Principe](#principe)
- [Tableau récapitulatif](#tableau-récapitulatif)
- [iCloud Mail](#icloud-mail)
- [Gmail / Google Workspace](#gmail--google-workspace)
- [Outlook.com / Microsoft 365](#outlookcom--microsoft-365)
- [Yahoo Mail / AOL](#yahoo-mail--aol)
- [Proton Mail](#proton-mail)
- [Infomaniak](#infomaniak)
- [IMAP générique](#imap-générique)

> Paramètres à revérifier à l'implémentation de chaque connecteur (phase 1 et 4) : les fournisseurs les modifient parfois.

## Principe

- **Jamais le mot de passe principal du compte.** Toujours un **mot de passe d'application** (révocable à tout moment chez le fournisseur) ou un **jeton OAuth**.
- Connexions chiffrées uniquement (IMAP 993 TLS, SMTP 465 TLS ou 587 STARTTLS).

## Tableau récapitulatif

| Fournisseur | IMAP | SMTP | Authentification |
|---|---|---|---|
| iCloud | `imap.mail.me.com:993` | `smtp.mail.me.com:587` | mot de passe d'application (2FA requise) |
| Gmail | `imap.gmail.com:993` | `smtp.gmail.com:465` | mot de passe d'application (2FA) ou OAuth |
| Outlook / M365 | `outlook.office365.com:993` | `smtp.office365.com:587` | OAuth uniquement (ou Microsoft Graph) |
| Yahoo | `imap.mail.yahoo.com:993` | `smtp.mail.yahoo.com:465` | mot de passe d'application |
| Proton | Bridge `127.0.0.1:1143` | Bridge `127.0.0.1:1025` | mot de passe généré par le Bridge |
| Infomaniak | `mail.infomaniak.com:993` | `mail.infomaniak.com:465` | mot de passe (d'application si 2FA) |

## iCloud Mail

1. appleid.apple.com → Connexion et sécurité → **Mots de passe pour app** → générer.
2. Identifiant IMAP : l'adresse `@icloud.com` (ou `@me.com`).
3. Pas d'OAuth disponible pour les tiers.

## Gmail / Google Workspace

- **Voie simple (phase 1)** : activer la validation en deux étapes, puis myaccount.google.com → *Mots de passe des applications*. IMAP + recherche Gmail native (`X-GM-RAW`) + libellés (`X-GM-LABELS`).
- **Voie OAuth (phase 4)** : XOAUTH2 sur IMAP ou Gmail API.
  - En local : l'utilisateur crée son propre client OAuth dans Google Cloud (mode « test », usage personnel).
  - En hébergé : client du projet → les scopes Gmail sont **restreints** → vérification Google + évaluation de sécurité annuelle.
- Workspace : l'administrateur peut avoir désactivé IMAP ou les mots de passe d'application.

## Outlook.com / Microsoft 365

- L'authentification par mot de passe (« basic auth ») n'est plus acceptée pour IMAP/SMTP → **OAuth 2.0 obligatoire**.
- Application enregistrée dans Microsoft Entra ID (multi-locataire + comptes personnels), permissions déléguées `Mail.ReadWrite`, `Mail.Send`, `offline_access`.
- Préférence : **Microsoft Graph** (recherche, catégories, synchronisation delta). IMAP XOAUTH2 en secours.
- En local : flux « code d'appareil » (l'utilisateur ouvre une URL, tape un code).

## Yahoo Mail / AOL

Paramètres du compte → Sécurité → **Générer un mot de passe d'application**. Même principe pour AOL (`imap.aol.com`).

## Proton Mail

- Proton chiffre de bout en bout : pas d'IMAP direct. La seule voie officielle est **Proton Mail Bridge**, réservée aux offres payantes.
- Le Bridge tourne dans un **conteneur dédié** du Compose (profil `proton`), connecté une fois par l'utilisateur (`login` interactif), puis expose IMAP/SMTP sur le réseau Docker interne uniquement.
- Les mails sont déchiffrés par le Bridge : à signaler clairement à l'utilisateur.

## Infomaniak

- Serveur `mail.infomaniak.com`, IMAP 993 / SMTP 465.
- Si la double authentification est active : créer un mot de passe d'application dans le Manager Infomaniak.
- Hébergement en Suisse (décision d'adéquation UE) : favorable côté RGPD.

## IMAP générique

Formulaire libre (hôte, port, TLS, identifiant). Préréglages prévus : OVH, Zoho, GMX, Fastmail (JMAP plus tard), Orange, Free, SFR, La Poste, serveurs Dovecot perso.
Détection automatique via la configuration Thunderbird (autoconfig) et les enregistrements DNS SRV (RFC 6186).
