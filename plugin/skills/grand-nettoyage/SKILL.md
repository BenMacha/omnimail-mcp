---
name: grand-nettoyage
description: Nettoie les boîtes mail avec omnimail (vieilles newsletters, notifications, réseaux sociaux, gros mails) vers l'archive ou la corbeille, de façon annulable. À utiliser pour libérer de l'espace, désencombrer ou viser la boîte zéro.
---

1. Propose des critères prudents : catégories `Newsletters`, `Notifications`, `Réseaux sociaux`, mails lus de plus de 180 jours, action `archive`. Pour l'espace disque : `largerThanKb: 5000` et `olderThanDays: 365`.
2. Appelle `cleanup_plan` (un plan par intention), présente le nombre de mails, les principaux expéditeurs et des exemples.
3. Propose des exclusions (`excludeSenders`) avant validation.
4. Après accord explicite : `plan_apply`. Jamais de suppression définitive : corbeille ou archive seulement.
5. Rappelle `plan_undo` pour revenir en arrière.
