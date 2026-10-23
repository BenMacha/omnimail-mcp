import { simpleParser } from "mailparser";
import MailComposer from "nodemailer/lib/mail-composer/index.js";
import type { Account } from "../accounts.js";
import { ensureFolder, findSpecialUse, inMailbox, isGmail, withImap } from "../imap.js";
import { encodeRef, type MessageRef } from "../refs.js";
import { sendRaw } from "../smtp.js";
import { fetchSource } from "./read.js";

export interface DraftInput {
  to: string[];
  cc?: string[];
  subject: string;
  body: string;
  inReplyTo?: string;
  references?: string;
}

function build(account: Account, d: DraftInput): Promise<Buffer> {
  const composer = new MailComposer({
    from: account.displayName ? `"${account.displayName}" <${account.address}>` : account.address,
    to: d.to,
    cc: d.cc,
    subject: d.subject,
    text: d.body,
    inReplyTo: d.inReplyTo,
    references: d.references,
  });
  return new Promise((resolve, reject) => composer.compile().build((err, msg) => (err ? reject(err) : resolve(msg))));
}

export async function createDraft(account: Account, d: DraftInput): Promise<{ ref?: string; folder: string }> {
  const raw = await build(account, d);
  return withImap(account, async (client) => {
    const folder = (await findSpecialUse(client, "\\Drafts")) ?? (await ensureFolder(client, ["Drafts"]));
    const res = await client.append(folder, raw, ["\\Draft", "\\Seen"]);
    return { folder, ref: res && res.uid ? encodeRef({ accountId: account.id, folder, uid: res.uid }) : undefined };
  });
}

export async function createReply(account: Account, original: MessageRef, body: string, replyAll: boolean) {
  const parsed = await simpleParser(await fetchSource(account, original));
  const replyTarget = parsed.replyTo?.value ?? parsed.from?.value ?? [];
  const to = replyTarget.map((a) => a.address!).filter(Boolean);
  const others = replyAll
    ? [
        ...(Array.isArray(parsed.to) ? parsed.to : parsed.to ? [parsed.to] : []),
        ...(Array.isArray(parsed.cc) ? parsed.cc : parsed.cc ? [parsed.cc] : []),
      ]
        .flatMap((x) => x.value.map((v) => v.address!))
        .filter((a) => a && a.toLowerCase() !== account.address.toLowerCase() && !to.includes(a))
    : [];
  const subject = /^(re|tr|fwd?)\s*:/i.test(parsed.subject ?? "") ? parsed.subject! : `Re: ${parsed.subject ?? ""}`;
  const refs = [parsed.references].flat().filter(Boolean).join(" ");
  return createDraft(account, {
    to,
    cc: others.length ? others : undefined,
    subject,
    body,
    inReplyTo: parsed.messageId,
    references: [refs, parsed.messageId].filter(Boolean).join(" "),
  });
}

/** Sends an existing draft, stores it in Sent (except Gmail, which does it itself), then removes the draft. */
export async function sendDraft(account: Account, draft: MessageRef): Promise<{ messageId?: string; to: string[] }> {
  const raw = await fetchSource(account, draft);
  const parsed = await simpleParser(raw);
  const list = (v: typeof parsed.to) => (Array.isArray(v) ? v : v ? [v] : []).flatMap((x) => x.value.map((a) => a.address!));
  const to = [...list(parsed.to), ...list(parsed.cc), ...list(parsed.bcc)].filter(Boolean);
  if (to.length === 0) throw new Error("The draft has no recipient.");
  await sendRaw(account, { from: account.address, to }, raw);
  await withImap(account, async (client) => {
    if (!isGmail(account)) {
      const sent = (await findSpecialUse(client, "\\Sent")) ?? (await ensureFolder(client, ["Sent"]));
      await client.append(sent, raw, ["\\Seen"]);
    }
    await inMailbox(client, draft.folder, async () => {
      await client.messageDelete(String(draft.uid), { uid: true });
    });
  });
  return { messageId: parsed.messageId, to };
}
