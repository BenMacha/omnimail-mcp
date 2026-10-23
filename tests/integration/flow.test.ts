/**
 * Parcours complet contre un vrai serveur IMAP/SMTP (GreenMail en conteneur) via un client MCP.
 *
 *   docker compose -f docker/compose.test.yml up -d
 *   npm run test:integration
 */
import { execFileSync } from "node:child_process";
import { createServer, type Server } from "node:https";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ImapFlow } from "imapflow";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

const HOST = process.env.GREENMAIL_HOST ?? "127.0.0.1";
const work = mkdtempSync(join(tmpdir(), "omnimail-it-"));
process.env.OMNIMAIL_DATA_DIR = work;
process.env.OMNIMAIL_MASTER_KEY = "test-master-key-not-for-production";
process.env.OMNIMAIL_ALLOW_PRIVATE_URLS = "true";
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

const { AccountStore } = await import("../../src/accounts.js");
const { createServer: createMcp } = await import("../../src/server.js");

const account = {
  provider: "generic",
  address: "dali@example.com",
  username: "dali",
  secret: "secret",
  imap: { host: HOST, port: 3143, secure: false },
  smtp: { host: HOST, port: 3025, secure: false },
};

let https: Server;
let unsubHits = 0;
let client: Client;

function imap() {
  return new ImapFlow({ host: HOST, port: 3143, secure: false, auth: { user: "dali", pass: "secret" }, logger: false });
}

const enc = (v: string) => (/^[\x20-\x7e]*$/.test(v) ? v : `=?UTF-8?B?${Buffer.from(v).toString("base64")}?=`);

function mail(from: string, subject: string, extra: string[] = [], body = "Bonjour") {
  return [`From: ${from}`, "To: dali@example.com", `Subject: ${enc(subject)}`, `Date: ${new Date().toUTCString()}`, `Message-ID: <${Math.random().toString(36).slice(2)}@test>`, ...extra, "Content-Type: text/plain; charset=utf-8", "", body, ""].join("\r\n");
}

async function call(name: string, args: Record<string, unknown> = {}) {
  const res = (await client.callTool({ name, arguments: args })) as { content: { type: string; text: string }[]; isError?: boolean };
  if (res.isError) throw new Error(res.content[0].text);
  const text = res.content.find((c) => c.text?.includes("<<<CONTENU_MAIL_NON_FIABLE>>>"))?.text ?? res.content[0].text;
  return JSON.parse(text.replace("<<<CONTENU_MAIL_NON_FIABLE>>>\n", "").replace("\n<<<FIN_CONTENU_MAIL>>>", ""));
}

async function folderCounts(): Promise<Record<string, number>> {
  const c = imap();
  await c.connect();
  const list = await c.list({ statusQuery: { messages: true } });
  await c.logout();
  return Object.fromEntries(list.map((f) => [f.path.split(f.delimiter || "/").join("/"), f.status?.messages ?? 0]));
}

beforeAll(async () => {
  execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", join(work, "k.pem"), "-out", join(work, "c.pem"), "-days", "1", "-subj", "/CN=localhost"], { stdio: "ignore" });
  https = createServer({ key: readFileSync(join(work, "k.pem")), cert: readFileSync(join(work, "c.pem")) }, (req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      if (req.method === "POST" && body === "List-Unsubscribe=One-Click") unsubHits++;
      res.writeHead(200).end("ok");
    });
  });
  await new Promise<void>((r) => https.listen(0, "127.0.0.1", r));
  const port = (https.address() as { port: number }).port;

  const c = imap();
  await c.connect();
  const lock = await c.getMailboxLock("INBOX");
  try {
    if (c.mailbox && c.mailbox.exists > 0) await c.messageDelete("1:*");
  } finally {
    lock.release();
  }
  const folders = (await c.list()).filter((f) => f.path !== "INBOX").sort((a, b) => b.path.length - a.path.length);
  for (const f of folders) await c.mailboxDelete(f.path);
  const oneClick = [`List-Unsubscribe: <https://localhost:${port}/u/42>, <mailto:u@shop.example>`, "List-Unsubscribe-Post: List-Unsubscribe=One-Click", "List-Id: Shop News <news.shop.example>"];
  for (let i = 0; i < 4; i++) await c.append("INBOX", mail('"Shop News" <news@shop.example>', `Promo de la semaine ${i}`, oneClick));
  for (let i = 0; i < 3; i++) await c.append("INBOX", mail('"Deals" <promo@deals.example>', `Bon plan ${i}`, ["List-Unsubscribe: <mailto:unsub@example.com?subject=unsubscribe>"]), ["\\Seen"]);
  const old = new Date(Date.now() - 200 * 86_400_000);
  await c.append("INBOX", mail('"EDF" <billing@edf.example>', "Votre facture d'octobre"), ["\\Seen"], old);
  await c.append("INBOX", mail('"EDF" <billing@edf.example>', "Votre facture de septembre"), ["\\Seen"], old);
  await c.append("INBOX", mail('"Banque" <no-reply@bank.example>', "Votre code de vérification : 123456"));
  await c.append("INBOX", mail('"Karim" <karim@example.org>', "Rendez-vous jeudi ?", [], "On se voit jeudi à 14h ?"));
  await c.append(
    "INBOX",
    [
      'From: "PayPal Service" <secure.paypal@gmail.com>',
      "Reply-To: support@paypa1-help.example",
      "To: dali@example.com",
      "Subject: Votre compte est suspendu - action requise",
      "Authentication-Results: mx.example.com; spf=softfail; dkim=none; dmarc=fail",
      `Date: ${new Date().toUTCString()}`,
      "Content-Type: text/html; charset=utf-8",
      "",
      '<p>Vérifiez votre compte immédiatement : <a href="http://203.0.113.9/login">https://www.paypal.com/signin</a></p>',
      "",
    ].join("\r\n"),
  );
  await c.logout();

  new AccountStore().add(account);
  const [a, b] = InMemoryTransport.createLinkedPair();
  await createMcp().connect(a);
  client = new Client({ name: "test", version: "1" });
  await client.connect(b);
}, 60_000);

afterAll(async () => {
  await client?.close();
  https?.close();
});

describe("omnimail de bout en bout", () => {
  it("expose les outils et les prompts", async () => {
    const tools = (await client.listTools()).tools.map((t) => t.name);
    expect(tools).toEqual(expect.arrayContaining(["mail_search", "recurring_senders_list", "unsubscribe_plan", "classify_plan", "cleanup_plan", "plan_apply", "plan_undo", "spam_check", "mail_send"]));
    const prompts = (await client.listPrompts()).prompts.map((p) => p.name);
    expect(prompts).toContain("menage-newsletters");
  });

  it("liste les comptes sans secret", async () => {
    const list = await call("accounts_list");
    expect(list).toHaveLength(1);
    expect(JSON.stringify(list)).not.toContain("secret");
  });

  it("cherche dans tous les comptes", async () => {
    const res = await call("mail_search", { subject: "facture" });
    expect(res.count).toBe(2);
  });

  it("détecte les envois récurrents et leur méthode de désabonnement", async () => {
    const res = await call("recurring_senders_list", { days: 30, minCount: 3 });
    const shop = res.senders.find((s: { key: string }) => s.key === "news.shop.example");
    const deals = res.senders.find((s: { key: string }) => s.key === "promo@deals.example");
    expect(shop).toMatchObject({ count: 4, unsubscribeMethod: "one-click", readRate: 0 });
    expect(deals).toMatchObject({ count: 3, unsubscribeMethod: "mailto", readRate: 1 });
  });

  it("classe en sous-dossiers puis déclasse", async () => {
    const plan = await call("classify_plan", { mode: "categorie" });
    expect(plan.destinations).toMatchObject({ "Classement/Factures": 2, "Classement/Newsletters": 7, "Classement/Sécurité": 1 });
    await expect(call("plan_apply", { planId: plan.planId, confirmToken: "mauvais" })).rejects.toThrow(/Jeton/);
    const applied = await call("plan_apply", { planId: plan.planId, confirmToken: plan.confirmToken });
    expect(applied.moved).toBe(10);
    let counts = await folderCounts();
    expect(counts.INBOX).toBe(2);
    expect(counts["Classement/Factures"]).toBe(2);

    const undo = await call("plan_undo", { planId: plan.planId });
    expect(undo.restored).toBe(10);
    counts = await folderCounts();
    expect(counts.INBOX).toBe(12);
    expect(counts["Classement/Factures"]).toBeUndefined();
  });

  it("désabonne (RFC 8058 et mailto) et range les anciens mails", async () => {
    const plan = await call("unsubscribe_plan", { days: 30, senders: ["news.shop.example", "promo@deals.example"], thenMove: "dossier" });
    expect(plan.unsubscribes).toHaveLength(2);
    const res = await call("plan_apply", { planId: plan.planId, confirmToken: plan.confirmToken });
    expect(res.errors).toEqual([]);
    expect(res.unsubscribed.map((u: { method: string }) => u.method).sort()).toEqual(["mailto", "one-click"]);
    expect(unsubHits).toBe(1);
    const counts = await folderCounts();
    expect(counts["Classement/Newsletters/Shop News"]).toBe(4);
    expect(counts["Classement/Newsletters/Deals"]).toBe(3);
  });

  it("nettoie vers la corbeille, de façon annulable", async () => {
    const plan = await call("cleanup_plan", { categories: ["Factures"], olderThanDays: 90, action: "corbeille" });
    expect(plan.mails).toBe(2);
    const res = await call("plan_apply", { planId: plan.planId, confirmToken: plan.confirmToken });
    expect(res.moved).toBe(2);
    expect((await folderCounts()).Trash).toBe(2);
    expect((await call("plan_undo", { planId: plan.planId })).restored).toBe(2);
    expect((await folderCounts()).Trash ?? 0).toBe(0);
  });

  it("repère le hameçonnage", async () => {
    const found = await call("mail_search", { subject: "suspendu" });
    const [report] = await call("spam_check", { refs: [found.results[0].ref] });
    expect(report.verdict).toBe("très suspect");
    expect(report.auth.dmarc).toBe("fail");
  });

  it("prépare une réponse et n'envoie qu'avec l'autorisation", async () => {
    // GreenMail ne fait pas de recherche partielle sur FROM (Dovecot, Gmail, iCloud oui) : adresse complète.
    const found = await call("mail_search", { from: "karim@example.org" });
    const draft = await call("draft_reply", { ref: found.results[0].ref, body: "C'est noté pour jeudi 14h." });
    expect(draft.ref).toBeTruthy();
    await expect(call("mail_send", { draftRef: draft.ref, confirm: true })).rejects.toThrow(/désactivé/);
    process.env.OMNIMAIL_SEND_ENABLED = "true";
    const sent = await call("mail_send", { draftRef: draft.ref, confirm: true });
    expect(sent.to).toEqual(["karim@example.org"]);
    delete process.env.OMNIMAIL_SEND_ENABLED;
  });
});
