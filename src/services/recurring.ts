import type { Account } from "../accounts.js";
import type { UnsubscribeInfo } from "../headers.js";
import { errorMessage, inMailbox, withImap } from "../imap.js";
import { fetchSummaries, type MessageSummary } from "./read.js";

export type UnsubscribeMethod = "one-click" | "mailto" | "link" | "none";

/** A sender who writes regularly (newsletters, notifications, promotions…). */
export interface RecurringSender {
  /** Stable key: List-Id when present, otherwise the sender address. */
  key: string;
  name?: string;
  address?: string;
  listId?: string;
  count: number;
  unread: number;
  /** Share of read messages (0 to 1): a low rate suggests unsubscribing. */
  readRate: number;
  firstDate?: string;
  lastDate?: string;
  /** Messages per week over the scanned period. */
  perWeek: number;
  accounts: string[];
  unsubscribe: UnsubscribeInfo;
  /** Available unsubscribe method. */
  unsubscribeMethod: UnsubscribeMethod;
  sampleSubjects: string[];
  refs: string[];
}

export function groupKey(m: MessageSummary): string {
  const listId = m.listId?.match(/<([^>]+)>/)?.[1] ?? m.listId;
  return (listId ?? m.fromAddress ?? "unknown").toLowerCase();
}

export function unsubscribeMethod(u: UnsubscribeInfo): UnsubscribeMethod {
  if (u.oneClick) return "one-click";
  if (u.mailto.length) return "mailto";
  if (u.http.length) return "link";
  return "none";
}

/** Groups summaries by sender and keeps only recurring ones. */
export function groupRecurring(messages: MessageSummary[], minCount: number, days: number): RecurringSender[] {
  const groups = new Map<string, MessageSummary[]>();
  for (const m of messages) {
    const key = groupKey(m);
    groups.set(key, [...(groups.get(key) ?? []), m]);
  }
  const out: RecurringSender[] = [];
  for (const [key, list] of groups) {
    const hasList = list.some((m) => m.unsubscribe.http.length || m.unsubscribe.mailto.length || m.listId);
    if (list.length < minCount && !(hasList && list.length >= 2)) continue;
    const sorted = [...list].sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
    const latestWithUnsub =
      sorted.find((m) => m.unsubscribe.oneClick) ??
      sorted.find((m) => m.unsubscribe.http.length || m.unsubscribe.mailto.length) ??
      sorted[0];
    const unread = list.filter((m) => !m.seen).length;
    const nameMatch = sorted[0].from?.match(/^(.*?)\s*</);
    out.push({
      key,
      name: nameMatch?.[1]?.replace(/^"|"$/g, "") || undefined,
      address: sorted[0].fromAddress,
      listId: sorted[0].listId,
      count: list.length,
      unread,
      readRate: Math.round(((list.length - unread) / list.length) * 100) / 100,
      firstDate: sorted[sorted.length - 1].date,
      lastDate: sorted[0].date,
      perWeek: Math.round((list.length / Math.max(days / 7, 1)) * 10) / 10,
      accounts: [...new Set(list.map((m) => m.accountId))],
      unsubscribe: latestWithUnsub.unsubscribe,
      unsubscribeMethod: unsubscribeMethod(latestWithUnsub.unsubscribe),
      sampleSubjects: sorted.slice(0, 3).map((m) => m.subject ?? ""),
      refs: sorted.map((m) => m.ref),
    });
  }
  return out.sort((a, b) => b.count - a.count);
}

export interface RecurringScanOptions {
  days: number;
  folder: string;
  minCount: number;
  maxScan: number;
}

export interface RecurringScan {
  senders: RecurringSender[];
  scanned: number;
  errors: { accountId: string; error: string }[];
  /** Raw summaries, kept in memory to build plans. */
  messages: MessageSummary[];
}

export async function scanRecurring(accounts: Account[], opts: RecurringScanOptions): Promise<RecurringScan> {
  const errors: RecurringScan["errors"] = [];
  const since = new Date(Date.now() - opts.days * 86_400_000);
  const perAccount = await Promise.all(
    accounts.map(async (account) => {
      try {
        return await withImap(account, (client) =>
          inMailbox(client, opts.folder, async () => {
            const uids = (await client.search({ since }, { uid: true })) || [];
            const newest = uids.sort((a, b) => b - a).slice(0, opts.maxScan);
            return fetchSummaries(client, account, opts.folder, newest);
          }),
        );
      } catch (err) {
        errors.push({ accountId: account.id, error: errorMessage(err) });
        return [];
      }
    }),
  );
  const messages = perAccount.flat();
  return { senders: groupRecurring(messages, opts.minCount, opts.days), scanned: messages.length, errors, messages };
}
