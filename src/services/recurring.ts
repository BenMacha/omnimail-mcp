import type { Account } from "../accounts.js";
import { errorMessage, inMailbox, withImap } from "../imap.js";
import type { UnsubscribeInfo } from "../headers.js";
import { fetchSummaries, type MessageSummary } from "./read.js";

/** Un expéditeur qui écrit régulièrement (newsletter, notifications, promotions…). */
export interface RecurringSender {
  /** Clé stable : List-Id si présent, sinon adresse de l'expéditeur. */
  key: string;
  name?: string;
  address?: string;
  listId?: string;
  count: number;
  unread: number;
  /** Part des messages lus (0 à 1) : un taux bas suggère un désabonnement. */
  readRate: number;
  firstDate?: string;
  lastDate?: string;
  /** Messages par semaine sur la période observée. */
  perWeek: number;
  accounts: string[];
  unsubscribe: UnsubscribeInfo;
  /** Méthode de désabonnement disponible. */
  unsubscribeMethod: "one-click" | "mailto" | "lien" | "aucune";
  sampleSubjects: string[];
  refs: string[];
}

export function groupKey(m: MessageSummary): string {
  const listId = m.listId?.match(/<([^>]+)>/)?.[1] ?? m.listId;
  return (listId ?? m.fromAddress ?? "inconnu").toLowerCase();
}

export function unsubscribeMethod(u: UnsubscribeInfo): RecurringSender["unsubscribeMethod"] {
  if (u.oneClick) return "one-click";
  if (u.mailto.length) return "mailto";
  if (u.http.length) return "lien";
  return "aucune";
}

/** Regroupe des résumés par expéditeur et ne garde que les envois récurrents. */
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
  /** Résumés bruts, gardés en mémoire pour construire les plans. */
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
