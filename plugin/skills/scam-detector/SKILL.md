---
name: scam-detector
description: Checks recent messages with omnimail for spam and phishing (SPF, DKIM, DMARC, spoofing, deceptive links, fake bank-detail changes). Use when the user doubts a message or wants to check their mailbox.
---

1. `mail_search` on recent messages (or the message the user points to), then `spam_check` in batches of at most 25.
2. Show "suspicious" and "very suspicious" messages with the reasons in plain words.
3. Never click a link, open an attachment or reply to the sender.
4. Offer to move them to the trash with `cleanup_plan` (`senders`), with confirmation.

Answer in the user's language.
