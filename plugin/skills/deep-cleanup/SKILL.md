---
name: deep-cleanup
description: Cleans mailboxes with omnimail (old newsletters, notifications, social networks, large messages) into the archive or the trash, revertibly. Use to free space, declutter or reach inbox zero.
---

1. Suggest careful criteria: categories `newsletters`, `notifications`, `social`, read messages older than 180 days, action `archive`. For disk space: `largerThanKb: 5000` and `olderThanDays: 365`.
2. Call `cleanup_plan` (one plan per intent), show the message count, top senders and examples.
3. Offer exclusions (`excludeSenders`) before approval.
4. After explicit approval: `plan_apply`. Never permanent deletion: trash or archive only.
5. Remind the user of `plan_undo`.

Answer in the user's language.
