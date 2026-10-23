---
name: sort-into-folders
description: Files a mailbox into sub-folders (invoices, banking, orders, travel, newsletters, per sender or with custom rules) with omnimail, and can revert the sorting. Use when the user wants to organize, sort or file e-mails into folders, or undo a sorting.
---

1. Ask for the account, the folder (INBOX by default) and the mode: `category` (one folder per category) or `sender` (one sub-folder per sender inside each category).
2. Suggest custom rules when the user has important senders, e.g. `{ "from": "durand.fr", "folder": "Work/Clients/Durand" }`.
3. Call `classify_plan`, show the split per folder and a few examples.
4. After explicit approval: `plan_apply`. Missing folders are created under the sorting root, in the language set by `settings.language` (en, fr, ar).
5. To revert: `plans_list`, then `plan_undo` on the chosen plan; messages go back and the empty folders it created are deleted.

Answer in the user's language.
