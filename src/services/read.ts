import type { ImapFlow, FetchMessageObject, SearchObject } from "imapflow";
import { simpleParser } from "mailparser";
import type { Account } from "../accounts.js";
import { errorMessage, findSpecialUse, inMailbox, isGmail, withImap } from "../imap.js";
import { encodeRef, type MessageRef } from "../refs.js";
import { extractAddress, header, parseHeaders, parseListUnsubscribe, type UnsubscribeInfo } from "../headers.js";

/** En-têtes récupérés pour chaque résumé de message. */
export const SUMMARY_HEADERS = [
  "list-unsubscribe",
  "list-unsubscribe-post",
  "list-id",
  "precedence",
  "auto-submitted",
  "message-id",
  "reply-to",
  "authentication-results",
];

export interface MessageSummary {
  ref: string;
  accountId: string;
  folder: string;
  uid: number;
  date?: string;
  from?: string;
  fromAddress?: string;
  to?: string[];
  subject?: string;
  seen: boolean;
  flagged: boolean;
  size?: number;
  messageId?: string;
  listId?: string;
  autoSubmitted?: string;
  precedence?: string;
  replyTo?: string;
  authResults?: string;
  unsubscribe: UnsubscribeInfo;
}

export function toSummary(account: Account, folder: string, msg: FetchMessageObject): MessageSummary {
  const h = parseHeaders(msg.headers);
  const env = msg.envelope;
  const fromEntry = env?.from?.[0];
  const fromAddress = fromEntry?.address?.toLowerCase();
  return {
    ref: encodeRef({ accountId: account.id, folder, uid: msg.uid }),
    accountId: account.id,
    folder,
    uid: msg.uid,
    date: env?.date ? new Date(env.date).toISOString() : undefined,
    from: fromEntry ? (fromEntry.name ? `${fromEntry.name} <${fromEntry.address}>` : fromEntry.address) : undefined,
    fromAddress,
    to: env?.to?.map((t) => t.address ?? "").filter(Boolean),
    subject: env?.subject,
    seen: msg.flags?.has("\\Seen") ?? false,
    flagged: msg.flags?.has("\\Flagged") ?? false,
    size: msg.size,
    messageId: env?.messageId ?? header(h, "message-id"),
    listId: header(h, "list-id"),
    autoSubmitted: header(h, "auto-submitted"),
    precedence: header(h, "precedence"),
    replyTo: extractAddress(header(h, "reply-to")),
    authResults: h.get("authentication-results")?.join(" ; "),
    unsubscribe: parseListUnsubscribe(header(h, "list-unsubscribe"), header(h, "list-unsubscribe-post")),
  };
}

export async function fetchSummaries(
  client: ImapFlow,
  account: Account,
  folder: string,
  uids: number[],
): Promise<MessageSummary[]> {
  if (uids.length === 0) return [];
  const out: MessageSummary[] = [];
  for await (const msg of client.fetch(
    uids,
    { uid: true, envelope: true, flags: true, size: true, headers: SUMMARY_HEADERS },
    { uid: true },
  )) {
    out.push(toSummary(account, folder, msg));
  }
  return out;
}

export interface FolderInfo {
  path: string;
  specialUse?: string;
  messages?: number;
  unseen?: number;
}

export async function listFolders(account: Account): Promise<FolderInfo[]> {
  return withImap(account, async (client) => {
    const list = await client.list({ statusQuery: { messages: true, unseen: true } });
    return list
      .filter((f) => !f.flags.has("\\Noselect"))
      .map((f) => ({ path: f.path, specialUse: f.specialUse, messages: f.status?.messages, unseen: f.status?.unseen }));
  });
}

export interface SearchCriteria {
  text?: string;
  from?: string;
  to?: string;
  subject?: string;
  since?: string;
  before?: string;
  unread?: boolean;
  flagged?: boolean;
  largerThanKb?: number;
  /** "inbox" (défaut), "all" (tous les dossiers sauf corbeille et spam) ou un chemin de dossier. */
  folder?: string;
  /** Requête Gmail native (comptes Gmail uniquement), ex. "has:attachment older_than:1y". */
  gmailQuery?: string;
  limit?: number;
}

function toSearchObject(c: SearchCriteria, gmail: boolean): SearchObject {
  const q: SearchObject = {};
  if (gmail && c.gmailQuery) q.gmraw = c.gmailQuery;
  if (c.text) q.text = c.text;
  if (c.from) q.from = c.from;
  if (c.to) q.to = c.to;
  if (c.subject) q.subject = c.subject;
  if (c.since) q.since = new Date(c.since);
  if (c.before) q.before = new Date(c.before);
  if (c.unread !== undefined) q.seen = !c.unread;
  if (c.flagged !== undefined) q.flagged = c.flagged;
  if (c.largerThanKb) q.larger = c.largerThanKb * 1024;
  if (Object.keys(q).length === 0) q.all = true;
  return q;
}

async function foldersToSearch(client: ImapFlow, account: Account, folder?: string): Promise<string[]> {
  if (!folder || folder.toLowerCase() === "inbox") return ["INBOX"];
  if (folder.toLowerCase() !== "all") return [folder];
  const list = await client.list();
  if (isGmail(account)) {
    const all = await findSpecialUse(client, "\\All", list);
    if (all) return [all];
  }
  return list
    .filter((f) => !f.flags.has("\\Noselect") && !["\\Trash", "\\Junk", "\\Drafts"].includes(f.specialUse ?? ""))
    .map((f) => f.path);
}

export interface SearchResult {
  results: MessageSummary[];
  errors: { accountId: string; error: string }[];
}

export async function searchAccounts(accounts: Account[], criteria: SearchCriteria, defaultLimit: number): Promise<SearchResult> {
  const limit = criteria.limit ?? defaultLimit;
  const errors: SearchResult["errors"] = [];
  const perAccount = await Promise.all(
    accounts.map(async (account) => {
      try {
        return await withImap(account, async (client) => {
          const found: MessageSummary[] = [];
          for (const folder of await foldersToSearch(client, account, criteria.folder)) {
            await inMailbox(client, folder, async () => {
              const uids = (await client.search(toSearchObject(criteria, isGmail(account)), { uid: true })) || [];
              const newest = uids.sort((a, b) => b - a).slice(0, limit);
              found.push(...(await fetchSummaries(client, account, folder, newest)));
            });
          }
          return found;
        });
      } catch (err) {
        errors.push({ accountId: account.id, error: errorMessage(err) });
        return [];
      }
    }),
  );
  const seen = new Set<string>();
  const results = perAccount
    .flat()
    .filter((m) => {
      const key = m.messageId ? `${m.accountId}:${m.messageId}` : m.ref;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
  return { results, errors };
}

export interface FullMessage {
  ref: string;
  from?: string;
  to?: string;
  cc?: string;
  replyTo?: string;
  date?: string;
  subject?: string;
  messageId?: string;
  text: string;
  truncated: boolean;
  attachments: { index: number; filename?: string; contentType: string; size: number }[];
}

function htmlToText(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li|h\d)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function fetchSource(account: Account, ref: MessageRef): Promise<Buffer> {
  return withImap(account, (client) =>
    inMailbox(client, ref.folder, async () => {
      const msg = await client.fetchOne(String(ref.uid), { source: true }, { uid: true });
      if (!msg || !msg.source) throw new Error("Message introuvable (déplacé ou supprimé ?).");
      return msg.source;
    }),
  );
}

export async function getMessage(account: Account, ref: MessageRef, maxChars = 20_000): Promise<FullMessage> {
  const parsed = await simpleParser(await fetchSource(account, ref));
  const body = parsed.text ?? (parsed.html ? htmlToText(parsed.html) : "");
  const addr = (v: unknown) => (v ? (Array.isArray(v) ? v.map((x) => x.text).join(", ") : (v as { text: string }).text) : undefined);
  return {
    ref: encodeRef(ref),
    from: addr(parsed.from),
    to: addr(parsed.to),
    cc: addr(parsed.cc),
    replyTo: addr(parsed.replyTo),
    date: parsed.date?.toISOString(),
    subject: parsed.subject,
    messageId: parsed.messageId,
    text: body.slice(0, maxChars),
    truncated: body.length > maxChars,
    attachments: parsed.attachments.map((a, index) => ({
      index,
      filename: a.filename,
      contentType: a.contentType,
      size: a.size,
    })),
  };
}

export async function getAttachment(account: Account, ref: MessageRef, index: number) {
  const parsed = await simpleParser(await fetchSource(account, ref));
  const att = parsed.attachments[index];
  if (!att) throw new Error(`Pièce jointe ${index} introuvable.`);
  return att;
}

export interface AccountHealth {
  accountId: string;
  address: string;
  ok: boolean;
  error?: string;
  folders?: number;
  inbox?: { messages?: number; unseen?: number };
  checkedAt: string;
}

export async function accountHealth(account: Account): Promise<AccountHealth> {
  const checkedAt = new Date().toISOString();
  try {
    return await withImap(account, async (client) => {
      const folders = await client.list();
      const inbox = await client.status("INBOX", { messages: true, unseen: true });
      return {
        accountId: account.id,
        address: account.address,
        ok: true,
        folders: folders.length,
        inbox: inbox ? { messages: inbox.messages, unseen: inbox.unseen } : undefined,
        checkedAt,
      };
    });
  } catch (err) {
    return { accountId: account.id, address: account.address, ok: false, error: errorMessage(err), checkedAt };
  }
}

/** Résumés des messages d'un dossier correspondant à une recherche, pour plusieurs comptes. */
export async function collectSummaries(
  accounts: Account[],
  folder: string,
  query: SearchObject,
  maxPerAccount: number,
): Promise<SearchResult> {
  const errors: SearchResult["errors"] = [];
  const lists = await Promise.all(
    accounts.map(async (account) => {
      try {
        return await withImap(account, (client) =>
          inMailbox(client, folder, async () => {
            const uids = (await client.search(query, { uid: true })) || [];
            return fetchSummaries(client, account, folder, uids.sort((a, b) => b - a).slice(0, maxPerAccount));
          }),
        );
      } catch (err) {
        errors.push({ accountId: account.id, error: errorMessage(err) });
        return [];
      }
    }),
  );
  return { results: lists.flat(), errors };
}
