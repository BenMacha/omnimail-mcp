---
name: classement-dossiers
description: Range une boîte mail en sous-dossiers (Factures, Banque, Commandes, Voyages, Newsletters, par expéditeur ou selon des règles) avec omnimail, et peut tout déclasser. À utiliser quand l'utilisateur veut organiser, classer, trier ses mails en dossiers, ou annuler un classement.
---

1. Demande le compte, le dossier (INBOX par défaut) et le mode : `categorie` (un dossier par catégorie) ou `expediteur` (un sous-dossier par expéditeur dans chaque catégorie).
2. Propose des règles personnalisées si l'utilisateur a des expéditeurs importants (ex. `{ from: "durand.fr", folder: "Pro/Clients/Durand" }`).
3. Appelle `classify_plan`, présente la répartition par dossier et quelques exemples.
4. Après accord explicite : `plan_apply`. Les dossiers manquants sont créés sous `Classement/`.
5. Pour « déclasser » : `plans_list` puis `plan_undo` sur le plan voulu ; les mails reviennent à leur place et les dossiers vides créés sont supprimés.
