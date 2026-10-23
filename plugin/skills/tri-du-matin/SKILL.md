---
name: tri-du-matin
description: Fait le point sur les mails non lus des dernières 24 heures dans tous les comptes via omnimail et les classe en urgent, à répondre, information, bruit. À utiliser pour un résumé de la boîte mail ou « qu'est-ce que j'ai reçu ».
---

1. `mail_search` avec `unread: true` et `since` = hier, sur tous les comptes.
2. Lis au besoin les mails importants avec `mail_get`.
3. Restitue quatre groupes : urgent, à répondre, pour information, bruit. Une ligne par mail : compte, expéditeur, objet, pourquoi.
4. Propose des brouillons de réponse (`draft_reply`) sans rien envoyer, et un `menage-newsletters` si le bruit domine.
