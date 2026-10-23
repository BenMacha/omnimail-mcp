import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import type { ImapFlow } from "imapflow";
import type { Account, AccountStore } from "../accounts.js";
import { dataPath, loadSettings } from "../config.js";
import { errorMessage, findSpecialUse, inMailbox, withImap } from "../imap.js";
import { decodeRef } from "../refs.js";
import { mailtoUnsubscribe, oneClickUnsubscribe } from "./unsubscribe.js";

/** Destination d'un déplacement : chemin explicite ou dossier spécial du serveur. */
export type Destination =
  | { kind: "path"; segments: string[] }
  | { kind: "special"; use: "\\Trash" | "\\Archive" | "\\Junk"; fallback: string[] };

export interface MoveAction {
  type: "move";
  ref: string;
  /** Clé de l'expéditeur (adresse ou List-Id), pour les exclusions. */
  sender?: string;
  messageId?: string;
  to: Destination;
}

export interface UnsubscribeAction {
  type: "unsubscribe";
  accountId: string;
  sender: string;
  name?: string;
  method: "one-click" | "mailto" | "lien";
  target: string;
}

export type PlannedAction = MoveAction | UnsubscribeAction;

export interface MovedRecord {
  accountId: string;
  from: string;
  uid: number;
  to: string;
  newUid?: number;
  messageId?: string;
}

export interface PlanResult {
  appliedAt: string;
  moved: MovedRecord[];
  createdFolders: { accountId: string; path: string }[];
  unsubscribed: { sender: string; method: string; detail: string }[];
  manualLinks: { sender: string; url: string }[];
  errors: string[];
  undoneAt?: string;
}

export type PlanKind = "classement" | "nettoyage" | "desabonnement";

export interface Plan {
  id: string;
  kind: PlanKind;
  description: string;
  token: string;
  createdAt: string;
  expiresAt: string;
  status: "en_attente" | "applique" | "defait" | "expire";
  actions: PlannedAction[];
  result?: PlanResult;
}

const RETENTION_DAYS = 30;

export class PlanStore {
  constructor(private readonly file = dataPath("plans.json")) {}

  private readAll(): Plan[] {
    if (!existsSync(this.file)) return [];
    const plans = JSON.parse(readFileSync(this.file, "utf8")) as Plan[];
    const limit = Date.now() - RETENTION_DAYS * 86_400_000;
    return plans.filter((p) => new Date(p.createdAt).getTime() > limit);
  }

  private writeAll(plans: Plan[]): void {
    writeFileSync(this.file, JSON.stringify(plans), { mode: 0o600 });
  }

  create(kind: PlanKind, description: string, actions: PlannedAction[]): Plan {
    const settings = loadSettings();
    const moves = actions.filter((a) => a.type === "move").length;
    if (moves > settings.maxActionsPerPlan) {
      throw new Error(
        `Plan trop gros (${moves} mails, maximum ${settings.maxActionsPerPlan}). Restreignez la période ou les critères.`,
      );
    }
    const now = Date.now();
    const plan: Plan = {
      id: randomUUID().slice(0, 8),
      kind,
      description,
      token: randomBytes(9).toString("base64url"),
      createdAt: new Date(now).toISOString(),
      expiresAt: new Date(now + settings.planTtlMinutes * 60_000).toISOString(),
      status: "en_attente",
      actions,
    };
    this.writeAll([...this.readAll(), plan]);
    return plan;
  }

  get(id: string): Plan {
    const plan = this.readAll().find((p) => p.id === id);
    if (!plan) throw new Error(`Plan inconnu ou trop ancien : ${id}`);
    if (plan.status === "en_attente" && new Date(plan.expiresAt).getTime() < Date.now()) plan.status = "expire";
    return plan;
  }

  list(): Plan[] {
    return this.readAll().map((p) => this.get(p.id));
  }

  save(plan: Plan): void {
    this.writeAll(this.readAll().map((p) => (p.id === plan.id ? plan : p)));
  }
}

export function checkToken(plan: Plan, token: string): void {
  const a = Buffer.from(plan.token);
  const b = Buffer.from(token ?? "");
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new Error("Jeton de confirmation invalide : présentez le plan à l'utilisateur et utilisez le jeton fourni.");
  }
}

async function resolveDestination(
  client: ImapFlow,
  dest: Destination,
  created: Set<string>,
): Promise<string> {
  const folders = await client.list();
  if (dest.kind === "special") {
    const found = await findSpecialUse(client, dest.use, folders);
    if (found) return found;
  }
  const segments = dest.kind === "path" ? dest.segments : dest.fallback;
  const delimiter = folders.find((f) => f.delimiter)?.delimiter ?? "/";
  let path = "";
  for (const segment of segments) {
    path = path ? `${path}${delimiter}${segment}` : segment;
    if (!folders.some((f) => f.path === path)) {
      const res = await client.mailboxCreate(path);
      if (res.created) created.add(res.path);
      folders.push({ path: res.path } as (typeof folders)[number]);
    }
  }
  return path;
}

const BATCH = 200;

export interface ApplyOptions {
  excludeRefs?: string[];
  excludeSenders?: string[];
}

export async function applyPlan(store: PlanStore, accounts: AccountStore, planId: string, token: string, opts: ApplyOptions = {}): Promise<Plan> {
  const plan = store.get(planId);
  if (plan.status !== "en_attente") throw new Error(`Ce plan est « ${plan.status} » : il ne peut plus être appliqué.`);
  checkToken(plan, token);

  const excludedRefs = new Set(opts.excludeRefs ?? []);
  const excludedSenders = (opts.excludeSenders ?? []).map((s) => s.toLowerCase());
  const isExcluded = (sender?: string) =>
    Boolean(sender && excludedSenders.some((x) => sender.toLowerCase() === x || sender.toLowerCase().endsWith(x)));

  const result: PlanResult = { appliedAt: new Date().toISOString(), moved: [], createdFolders: [], unsubscribed: [], manualLinks: [], errors: [] };

  // Désabonnements
  for (const action of plan.actions) {
    if (action.type !== "unsubscribe" || isExcluded(action.sender)) continue;
    try {
      if (action.method === "one-click") {
        const r = await oneClickUnsubscribe(action.target);
        result.unsubscribed.push({ sender: action.sender, method: "one-click", detail: `HTTP ${r.status}` });
      } else if (action.method === "mailto") {
        const r = await mailtoUnsubscribe(accounts.get(action.accountId), action.target);
        result.unsubscribed.push({ sender: action.sender, method: "mailto", detail: `demande envoyée à ${r.to}` });
      } else {
        result.manualLinks.push({ sender: action.sender, url: action.target });
      }
    } catch (err) {
      result.errors.push(`Désabonnement ${action.sender} : ${errorMessage(err)}`);
    }
  }

  // Déplacements, regroupés par compte → dossier source → destination
  const moves = plan.actions.filter(
    (a): a is MoveAction => a.type === "move" && !excludedRefs.has(a.ref) && !isExcluded(a.sender),
  );
  const byAccount = new Map<string, MoveAction[]>();
  for (const m of moves) {
    const { accountId } = decodeRef(m.ref);
    byAccount.set(accountId, [...(byAccount.get(accountId) ?? []), m]);
  }

  for (const [accountId, list] of byAccount) {
    let account: Account;
    try {
      account = accounts.get(accountId);
    } catch (err) {
      result.errors.push(errorMessage(err));
      continue;
    }
    try {
      await withImap(account, async (client) => {
        const created = new Set<string>();
        const groups = new Map<string, { folder: string; to: Destination; items: MoveAction[] }>();
        for (const m of list) {
          const { folder } = decodeRef(m.ref);
          const key = `${folder}\u0000${JSON.stringify(m.to)}`;
          const g = groups.get(key) ?? { folder, to: m.to, items: [] };
          g.items.push(m);
          groups.set(key, g);
        }
        for (const g of groups.values()) {
          const dest = await resolveDestination(client, g.to, created);
          if (dest === g.folder) continue;
          await inMailbox(client, g.folder, async () => {
            for (let i = 0; i < g.items.length; i += BATCH) {
              const chunk = g.items.slice(i, i + BATCH);
              const uids = chunk.map((m) => decodeRef(m.ref).uid);
              try {
                const res = await client.messageMove(uids, dest, { uid: true });
                for (const m of chunk) {
                  const uid = decodeRef(m.ref).uid;
                  // Avec UIDPLUS, le serveur confirme chaque message déplacé : on ignore ceux qui n'existaient plus.
                  if (res && res.uidMap && res.uidMap.size > 0 && !res.uidMap.has(uid)) continue;
                  result.moved.push({
                    accountId,
                    from: g.folder,
                    uid,
                    to: dest,
                    newUid: res ? res.uidMap?.get(uid) : undefined,
                    messageId: m.messageId,
                  });
                }
              } catch (err) {
                result.errors.push(`${accountId} ${g.folder} → ${dest} : ${errorMessage(err)}`);
              }
            }
          });
        }
        for (const path of created) result.createdFolders.push({ accountId, path });
      });
    } catch (err) {
      result.errors.push(`${accountId} : ${errorMessage(err)}`);
    }
  }

  plan.status = "applique";
  plan.result = result;
  store.save(plan);
  return plan;
}

/** Remet les mails déplacés à leur place et supprime les dossiers créés s'ils sont vides. */
export async function undoPlan(store: PlanStore, accounts: AccountStore, planId: string): Promise<{ restored: number; errors: string[]; removedFolders: string[] }> {
  const plan = store.get(planId);
  if (plan.status !== "applique" || !plan.result) throw new Error("Seul un plan appliqué peut être défait.");
  const errors: string[] = [];
  const removedFolders: string[] = [];
  let restored = 0;

  const byAccount = new Map<string, MovedRecord[]>();
  for (const r of plan.result.moved) byAccount.set(r.accountId, [...(byAccount.get(r.accountId) ?? []), r]);

  for (const [accountId, records] of byAccount) {
    try {
      await withImap(accounts.get(accountId), async (client) => {
        const groups = new Map<string, MovedRecord[]>();
        for (const r of records) {
          const key = `${r.to}\u0000${r.from}`;
          groups.set(key, [...(groups.get(key) ?? []), r]);
        }
        for (const list of groups.values()) {
          const { to, from } = list[0];
          await inMailbox(client, to, async () => {
            const uids: number[] = [];
            for (const r of list) {
              if (r.newUid) uids.push(r.newUid);
              else if (r.messageId) {
                const found = (await client.search({ header: { "message-id": r.messageId } }, { uid: true })) || [];
                uids.push(...found);
              }
            }
            for (let i = 0; i < uids.length; i += BATCH) {
              const chunk = uids.slice(i, i + BATCH);
              try {
                await client.messageMove(chunk, from, { uid: true });
                restored += chunk.length;
              } catch (err) {
                errors.push(`${accountId} ${to} → ${from} : ${errorMessage(err)}`);
              }
            }
          });
        }
        const created = plan.result!.createdFolders.filter((f) => f.accountId === accountId).map((f) => f.path);
        for (const path of created.sort((a, b) => b.length - a.length)) {
          try {
            const status = await client.status(path, { messages: true });
            const hasChildren = (await client.list()).some((f) => f.path !== path && f.path.startsWith(path) && f.parentPath === path);
            if (status && status.messages === 0 && !hasChildren) {
              await client.mailboxDelete(path);
              removedFolders.push(path);
            }
          } catch (err) {
            errors.push(`Suppression du dossier ${path} : ${errorMessage(err)}`);
          }
        }
      });
    } catch (err) {
      errors.push(`${accountId} : ${errorMessage(err)}`);
    }
  }

  plan.status = "defait";
  plan.result.undoneAt = new Date().toISOString();
  store.save(plan);
  return { restored, errors, removedFolders };
}
