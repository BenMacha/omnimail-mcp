import { beforeEach, describe, expect, it, vi } from "vitest";
import { isolatedDataDir, testAccount } from "../helpers/env.js";
import { FakeImap } from "../helpers/fake-imap.js";

const servers = new Map<string, FakeImap>();

vi.mock("../../src/imap.js", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../src/imap.js")>();
  return {
    ...real,
    withImap: async (account: { id: string }, fn: (c: unknown) => unknown) => {
      const s = servers.get(account.id);
      if (!s) throw Object.assign(new Error("auth"), { authenticationFailed: true });
      return fn(s);
    },
  };
});

const unsub = { oneClick: vi.fn(), mailto: vi.fn() };
vi.mock("../../src/services/unsubscribe.js", () => ({
  oneClickUnsubscribe: (url: string) => unsub.oneClick(url),
  mailtoUnsubscribe: (_a: unknown, uri: string) => unsub.mailto(uri),
}));

const { AccountStore } = await import("../../src/accounts.js");
const { PlanStore, applyPlan, checkToken, undoPlan } = await import("../../src/services/plans.js");
const { saveSettings } = await import("../../src/config.js");
const { encodeRef } = await import("../../src/refs.js");

let accounts: InstanceType<typeof AccountStore>;
let plans: InstanceType<typeof PlanStore>;
let imap: FakeImap;

function ref(uid: number, folder = "INBOX", accountId = "moi-example-com") {
  return encodeRef({ accountId, folder, uid });
}

beforeEach(() => {
  isolatedDataDir();
  servers.clear();
  imap = new FakeImap("/", { Trash: "\\Trash" });
  servers.set("moi-example-com", imap);
  accounts = new AccountStore();
  accounts.add(testAccount);
  plans = new PlanStore();
  unsub.oneClick.mockReset().mockResolvedValue({ status: 200 });
  unsub.mailto.mockReset().mockResolvedValue({ to: "u@x.example" });
});

describe("PlanStore", () => {
  it("crée un plan en attente avec un jeton et une expiration", () => {
    const plan = plans.create("cleanup", "test", []);
    expect(plan.status).toBe("pending");
    expect(plan.token.length).toBeGreaterThanOrEqual(12);
    expect(new Date(plan.expiresAt).getTime() - new Date(plan.createdAt).getTime()).toBe(15 * 60_000);
    expect(plans.get(plan.id).id).toBe(plan.id);
    expect(plans.list()).toHaveLength(1);
  });

  it("marque un plan expiré", () => {
    saveSettings({ planTtlMinutes: 0 });
    const plan = plans.create("cleanup", "test", []);
    vi.useFakeTimers({ now: Date.now() + 1000 });
    expect(plans.get(plan.id).status).toBe("expired");
    vi.useRealTimers();
  });

  it("refuse un plan trop gros", () => {
    saveSettings({ maxActionsPerPlan: 2 });
    const to = { kind: "path" as const, segments: ["A"] };
    expect(() =>
      plans.create(
        "classify",
        "x",
        [1, 2, 3].map((uid) => ({ type: "move" as const, ref: ref(uid), to })),
      ),
    ).toThrow(/too large/);
  });

  it("refuse un plan inconnu", () => {
    expect(() => plans.get("nope")).toThrow(/Unknown/);
  });

  it("vérifie le jeton en temps constant", () => {
    const plan = plans.create("cleanup", "x", []);
    expect(() => checkToken(plan, plan.token)).not.toThrow();
    expect(() => checkToken(plan, "faux")).toThrow(/token/);
    expect(() => checkToken(plan, `${plan.token.slice(0, -1)}x`)).toThrow(/token/);
  });

  it("oublie les plans de plus de 30 jours", () => {
    const plan = plans.create("cleanup", "x", []);
    vi.useFakeTimers({ now: Date.now() + 31 * 86_400_000 });
    expect(() => plans.get(plan.id)).toThrow(/Unknown/);
    vi.useRealTimers();
  });
});

describe("applyPlan / undoPlan", () => {
  it("classe en créant les dossiers, puis déclasse et supprime les dossiers vides", async () => {
    const a = imap.seed("INBOX", { from: "billing@edf.fr", subject: "Facture" });
    const b = imap.seed("INBOX", { from: "n@shop.example", subject: "Promo" });
    imap.seed("INBOX", { from: "karim@example.org", subject: "Salut" });
    const plan = plans.create("classify", "x", [
      { type: "move", ref: ref(a.uid), messageId: a.messageId, to: { kind: "path", segments: ["Classement", "Factures"] } },
      { type: "move", ref: ref(b.uid), messageId: b.messageId, to: { kind: "path", segments: ["Classement", "Newsletters"] } },
    ]);

    const applied = await applyPlan(plans, accounts, plan.id, plan.token);
    expect(applied.status).toBe("applied");
    expect(applied.result?.moved).toHaveLength(2);
    expect(applied.result?.createdFolders.map((f) => f.path).sort()).toEqual([
      "Classement",
      "Classement/Factures",
      "Classement/Newsletters",
    ]);
    expect(imap.count("INBOX")).toBe(1);
    expect(imap.count("Classement/Factures")).toBe(1);
    await expect(applyPlan(plans, accounts, plan.id, plan.token)).rejects.toThrow(/applied/);

    const undo = await undoPlan(plans, accounts, plan.id);
    expect(undo.restored).toBe(2);
    expect(undo.errors).toEqual([]);
    expect(undo.removedFolders.sort()).toEqual(["Classement", "Classement/Factures", "Classement/Newsletters"]);
    expect(imap.count("INBOX")).toBe(3);
    expect(plans.get(plan.id).status).toBe("undone");
    await expect(undoPlan(plans, accounts, plan.id)).rejects.toThrow(/applied/);
  });

  it("refuse un mauvais jeton sans rien modifier", async () => {
    const a = imap.seed("INBOX", { from: "x@y.z", subject: "s" });
    const plan = plans.create("cleanup", "x", [{ type: "move", ref: ref(a.uid), to: { kind: "path", segments: ["A"] } }]);
    await expect(applyPlan(plans, accounts, plan.id, "faux")).rejects.toThrow(/token/);
    expect(imap.count("INBOX")).toBe(1);
    expect(imap.calls).toEqual([]);
  });

  it("utilise le dossier spécial du serveur (corbeille) sans en créer", async () => {
    const a = imap.seed("INBOX", { from: "x@y.z", subject: "s" });
    const plan = plans.create("cleanup", "x", [
      { type: "move", ref: ref(a.uid), to: { kind: "special", use: "\\Trash", fallback: ["Corbeille"] } },
    ]);
    const applied = await applyPlan(plans, accounts, plan.id, plan.token);
    expect(imap.count("Trash")).toBe(1);
    expect(applied.result?.createdFolders).toEqual([]);
  });

  it("crée le dossier de repli si le serveur n'a pas de dossier spécial", async () => {
    const a = imap.seed("INBOX", { from: "x@y.z", subject: "s" });
    const plan = plans.create("cleanup", "x", [
      { type: "move", ref: ref(a.uid), to: { kind: "special", use: "\\Archive", fallback: ["Archive"] } },
    ]);
    await applyPlan(plans, accounts, plan.id, plan.token);
    expect(imap.count("Archive")).toBe(1);
  });

  it("respecte le séparateur du serveur", async () => {
    imap = new FakeImap(".");
    servers.set("moi-example-com", imap);
    const a = imap.seed("INBOX", { from: "x@y.z", subject: "s" });
    const plan = plans.create("classify", "x", [
      { type: "move", ref: ref(a.uid), to: { kind: "path", segments: ["Classement", "Banque"] } },
    ]);
    await applyPlan(plans, accounts, plan.id, plan.token);
    expect(imap.count("Classement.Banque")).toBe(1);
  });

  it("applique les exclusions par expéditeur et par référence", async () => {
    const a = imap.seed("INBOX", { from: "a@lemonde.fr", subject: "1" });
    const b = imap.seed("INBOX", { from: "b@shop.example", subject: "2" });
    const c = imap.seed("INBOX", { from: "c@shop.example", subject: "3" });
    const to = { kind: "path" as const, segments: ["Tri"] };
    const plan = plans.create("cleanup", "x", [
      { type: "move", ref: ref(a.uid), sender: "a@lemonde.fr", to },
      { type: "move", ref: ref(b.uid), sender: "b@shop.example", to },
      { type: "move", ref: ref(c.uid), sender: "c@shop.example", to },
    ]);
    const applied = await applyPlan(plans, accounts, plan.id, plan.token, { excludeSenders: ["lemonde.fr"], excludeRefs: [ref(c.uid)] });
    expect(applied.result?.moved.map((m) => m.uid)).toEqual([b.uid]);
    expect(imap.count("INBOX")).toBe(2);
  });

  it("ignore les mails disparus entre le plan et l'exécution", async () => {
    const a = imap.seed("INBOX", { from: "x@y.z", subject: "s" });
    const plan = plans.create("cleanup", "x", [
      { type: "move", ref: ref(a.uid), to: { kind: "path", segments: ["A"] } },
      { type: "move", ref: ref(999), to: { kind: "path", segments: ["A"] } },
    ]);
    const applied = await applyPlan(plans, accounts, plan.id, plan.token);
    expect(applied.result?.moved).toHaveLength(1);
  });

  it("déclasse par Message-ID quand le serveur ne renvoie pas les nouveaux UID", async () => {
    imap.noUidPlus = true;
    const a = imap.seed("INBOX", { from: "x@y.z", subject: "s" });
    const plan = plans.create("cleanup", "x", [
      { type: "move", ref: ref(a.uid), messageId: a.messageId, to: { kind: "path", segments: ["A"] } },
    ]);
    const applied = await applyPlan(plans, accounts, plan.id, plan.token);
    expect(applied.result?.moved[0].newUid).toBeUndefined();
    const undo = await undoPlan(plans, accounts, plan.id);
    expect(undo.restored).toBe(1);
    expect(imap.count("INBOX")).toBe(1);
  });

  it("conserve un dossier créé s'il n'est plus vide au moment du déclassement", async () => {
    const a = imap.seed("INBOX", { from: "x@y.z", subject: "s" });
    const plan = plans.create("classify", "x", [{ type: "move", ref: ref(a.uid), to: { kind: "path", segments: ["A"] } }]);
    await applyPlan(plans, accounts, plan.id, plan.token);
    imap.seed("A", { from: "autre@y.z", subject: "arrivé entre-temps" });
    const undo = await undoPlan(plans, accounts, plan.id);
    expect(undo.removedFolders).toEqual([]);
    expect(imap.count("A")).toBe(1);
  });

  it("rapporte les erreurs sans interrompre les autres comptes", async () => {
    const other = new FakeImap();
    servers.set("autre-example-com", other);
    accounts.add({ ...testAccount, address: "autre@example.com" });
    const a = imap.seed("INBOX", { from: "x@y.z", subject: "s" });
    const b = other.seed("INBOX", { from: "x@y.z", subject: "s" });
    imap.failMoveTo = "A";
    const to = { kind: "path" as const, segments: ["A"] };
    const plan = plans.create("cleanup", "x", [
      { type: "move", ref: ref(a.uid), to },
      { type: "move", ref: ref(b.uid, "INBOX", "autre-example-com"), to },
      { type: "move", ref: ref(1, "INBOX", "inconnu"), to },
    ]);
    const applied = await applyPlan(plans, accounts, plan.id, plan.token);
    expect(applied.result?.moved).toHaveLength(1);
    expect(applied.result?.errors.join("\n")).toMatch(/Move refused/);
    expect(applied.result?.errors.join("\n")).toMatch(/Unknown/);
    expect(other.count("A")).toBe(1);
  });

  it("désabonne selon la méthode et rend les liens web à l'utilisateur", async () => {
    unsub.mailto.mockRejectedValueOnce(new Error("SMTP unavailable"));
    const plan = plans.create("unsubscribe", "x", [
      { type: "unsubscribe", accountId: "moi-example-com", sender: "news.shop", method: "one-click", target: "https://shop.example/u" },
      { type: "unsubscribe", accountId: "moi-example-com", sender: "deals", method: "mailto", target: "mailto:u@deals.example" },
      { type: "unsubscribe", accountId: "moi-example-com", sender: "blog", method: "link", target: "https://blog.example/settings" },
      {
        type: "unsubscribe",
        accountId: "moi-example-com",
        sender: "garde.example",
        method: "one-click",
        target: "https://garde.example/u",
      },
    ]);
    const applied = await applyPlan(plans, accounts, plan.id, plan.token, { excludeSenders: ["garde.example"] });
    expect(unsub.oneClick).toHaveBeenCalledTimes(1);
    expect(unsub.oneClick).toHaveBeenCalledWith("https://shop.example/u");
    expect(applied.result?.unsubscribed).toEqual([{ sender: "news.shop", method: "one-click", detail: "HTTP 200" }]);
    expect(applied.result?.manualLinks).toEqual([{ sender: "blog", url: "https://blog.example/settings" }]);
    expect(applied.result?.errors).toEqual(["Unsubscribe deals: SMTP unavailable"]);
  });
});
