---
name: detecteur-arnaques
description: Analyse les mails récents avec omnimail pour détecter spam et hameçonnage (SPF, DKIM, DMARC, usurpation, liens trompeurs, faux changement de RIB). À utiliser quand l'utilisateur doute d'un mail ou veut vérifier sa boîte.
---

1. `mail_search` sur les mails récents (ou le mail désigné), puis `spam_check` par lots de 25 maximum.
2. Présente les mails « suspect » et « très suspect » avec les raisons en langage simple.
3. Ne clique sur aucun lien, n'ouvre aucune pièce jointe, ne réponds pas à l'expéditeur.
4. Propose de les déplacer dans le spam ou la corbeille via `cleanup_plan` (`senders`) avec confirmation.
