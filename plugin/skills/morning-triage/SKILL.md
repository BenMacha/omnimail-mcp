---
name: morning-triage
description: Reviews unread messages from the last 24 hours across all accounts with omnimail and groups them into urgent, to answer, information and noise. Use for a mailbox summary or "what did I get".
---

1. `mail_search` with `unread: true` and `since` = yesterday, across all accounts.
2. Read important messages with `mail_get` when needed.
3. Return four groups: urgent, to answer, for information, noise. One line per message: account, sender, subject, why.
4. Offer reply drafts (`draft_reply`) without sending anything, and the newsletter-cleanup skill when noise dominates.

Answer in the user's language.
