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

const sent: { envelope?: unknown; raw?: string; mail?: unknown }[] = [];
vi.mock("../../src/smtp.js", () => ({
  sendRaw: async (_a: unknown, envelope: unknown, raw: Buffer | string) => sent.push({ envelope, raw: raw.toString() }),
  sendSimple: async (_a: unknown, mail: unknown) => sent.push({ mail }),
}));

const { encodeRef, decodeRef } = await import("../../src/refs.js");
const read = await import("../../src/services/read.js");
const drafts = await import("../../src/services/drafts.js");
const { scanRecurring } = await import("../../src/services/recurring.js");

const account = { ...testAccount, id: "me", createdAt: "" };
const gmail = { ...testAccount, id: "g", address: "me@gmail.com", provider: "gmail", createdAt: "" };
let imap: FakeImap;

beforeEach(() => {
  isolatedDataDir();
  servers.clear();
  sent.length = 0;
  imap = new FakeImap("/", { Sent: "\\Sent", Drafts: "\\Drafts", Trash: "\\Trash", Junk: "\\Junk" });
  servers.set("me", imap);
});

describe("searchAccounts", () => {
  it("searches several accounts, sorts newest first and deduplicates by Message-ID", async () => {
    const other = new FakeImap();
    servers.set("g", other);
    imap.seed("INBOX", { from: "a@x.example", subject: "Invoice 1", date: new Date("2026-10-01") });
    imap.seed("INBOX", { from: "b@x.example", subject: "Invoice 2", date: new Date("2026-10-03") });
    const dup = imap.seed("INBOX", { from: "c@x.example", subject: "Invoice dup", date: new Date("2026-10-02") });
    imap.folders.get("INBOX")!.messages.set(99, { ...dup, uid: 99 });
    other.seed("INBOX", { from: "c@y.example", subject: "Invoice 3", date: new Date("2026-10-02") });
    other.seed("INBOX", { from: "c@y.example", subject: "Other", date: new Date("2026-10-04") });

    const { results, errors } = await read.searchAccounts([account, gmail], { subject: "invoice" }, 50);
    expect(errors).toEqual([]);
    expect(results.map((r) => r.subject)).toEqual(["Invoice 2", "Invoice dup", "Invoice 3", "Invoice 1"]);
  });

  it("applies the per-account limit and keeps the newest", async () => {
    for (let i = 0; i < 5; i++) imap.seed("INBOX", { from: "a@x.example", subject: `m${i}` });
    const { results } = await read.searchAccounts([account], { limit: 2 }, 50);
    expect(results.map((r) => r.uid).sort()).toEqual([4, 5]);
  });

  it("reports failing accounts without failing the search", async () => {
    imap.seed("INBOX", { from: "a@x.example", subject: "ok" });
    const broken = { ...account, id: "broken" };
    const { results, errors } = await read.searchAccounts([account, broken], {}, 50);
    expect(results).toHaveLength(1);
    expect(errors).toEqual([{ accountId: "broken", error: "Authentication refused (app password revoked or wrong)." }]);
  });

  it("searches every folder except trash, junk and drafts with folder=all", async () => {
    imap.folders.set("Work", { uidNext: 1, messages: new Map() });
    imap.seed("INBOX", { from: "a@x.example", subject: "in inbox" });
    imap.seed("Work", { from: "a@x.example", subject: "in work" });
    imap.seed("Trash", { from: "a@x.example", subject: "in trash" });
    const { results } = await read.searchAccounts([account], { folder: "all" }, 50);
    expect(results.map((r) => r.subject).sort()).toEqual(["in inbox", "in work"]);
  });

  it("uses Gmail's All Mail folder for folder=all on Gmail", async () => {
    const g = new FakeImap("/", { "[Gmail]/All Mail": "\\All" });
    servers.set("g", g);
    g.seed("[Gmail]/All Mail", { from: "a@x.example", subject: "archived" });
    const { results } = await read.searchAccounts([gmail], { folder: "all", gmailQuery: "older_than:1y" }, 50);
    expect(results.map((r) => r.folder)).toEqual(["[Gmail]/All Mail"]);
  });

  it("filters on unread, sender and dates", async () => {
    imap.seed("INBOX", { from: "a@x.example", subject: "read", seen: true, date: new Date("2026-01-01") });
    imap.seed("INBOX", { from: "a@x.example", subject: "new", date: new Date("2026-10-01") });
    imap.seed("INBOX", { from: "b@x.example", subject: "other", date: new Date("2026-10-01") });
    expect((await read.searchAccounts([account], { unread: true, from: "a@x" }, 50)).results.map((r) => r.subject)).toEqual(["new"]);
    expect((await read.searchAccounts([account], { since: "2026-06-01", before: "2026-12-01" }, 50)).results).toHaveLength(2);
  });
});

describe("summaries", () => {
  it("reads list headers, auth results and flags", async () => {
    imap.seed("INBOX", {
      from: "n@shop.example",
      name: "Shop",
      subject: "Promo",
      seen: true,
      headers: {
        "List-Unsubscribe": "<https://shop.example/u>",
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        "List-Id": "Shop <news.shop.example>",
        "Reply-To": "Support <help@shop.example>",
        "Authentication-Results": "mx; dmarc=pass",
      },
    });
    const { results } = await read.collectSummaries([account], "INBOX", { all: true }, 10);
    expect(results[0]).toMatchObject({
      from: "Shop <n@shop.example>",
      fromAddress: "n@shop.example",
      seen: true,
      listId: "Shop <news.shop.example>",
      replyTo: "help@shop.example",
      authResults: "mx; dmarc=pass",
      unsubscribe: { oneClick: true },
    });
    expect(decodeRef(results[0].ref)).toEqual({ accountId: "me", folder: "INBOX", uid: 1 });
  });

  it("collectSummaries reports a missing folder as an error", async () => {
    const { results, errors } = await read.collectSummaries([account], "Nope", { all: true }, 10);
    expect(results).toEqual([]);
    expect(errors[0].error).toMatch(/doesn't exist/);
  });
});

describe("messages", () => {
  it("returns text, converts HTML and truncates", async () => {
    const m = imap.seed("INBOX", {
      from: "a@x.example",
      subject: "html",
      source: [
        "From: A <a@x.example>",
        "Subject: html",
        "Content-Type: text/html",
        "",
        "<p>Hello&nbsp;<b>world</b></p><script>evil()</script>",
      ].join("\r\n"),
    });
    const full = await read.getMessage(account, { accountId: "me", folder: "INBOX", uid: m.uid });
    expect(full.text).toContain("Hello world");
    expect(full.text).not.toContain("evil");
    const short = await read.getMessage(account, { accountId: "me", folder: "INBOX", uid: m.uid }, 3);
    expect(short.truncated).toBe(true);
  });

  it("lists and returns attachments", async () => {
    const m = imap.seed("INBOX", {
      from: "a@x.example",
      subject: "att",
      source: [
        "From: a@x.example",
        "Subject: att",
        'Content-Type: multipart/mixed; boundary="b"',
        "",
        "--b",
        "Content-Type: text/plain",
        "",
        "body",
        "--b",
        'Content-Type: text/csv; name="data.csv"',
        'Content-Disposition: attachment; filename="data.csv"',
        "",
        "a,b",
        "--b--",
      ].join("\r\n"),
    });
    const ref = { accountId: "me", folder: "INBOX", uid: m.uid };
    expect((await read.getMessage(account, ref)).attachments).toEqual([
      { index: 0, filename: "data.csv", contentType: "text/csv", size: 3 },
    ]);
    expect((await read.getAttachment(account, ref, 0)).content.toString()).toBe("a,b");
    await expect(read.getAttachment(account, ref, 5)).rejects.toThrow(/not found/);
  });

  it("explains when a message vanished", async () => {
    await expect(read.getMessage(account, { accountId: "me", folder: "INBOX", uid: 42 })).rejects.toThrow(/not found/);
  });
});

describe("folders and health", () => {
  it("lists folders with counts", async () => {
    imap.seed("INBOX", { from: "a@x.example", subject: "s" });
    const folders = await read.listFolders(account);
    expect(folders.find((f) => f.path === "INBOX")).toMatchObject({ messages: 1, unseen: 1 });
    expect(folders.find((f) => f.path === "Trash")?.specialUse).toBe("\\Trash");
  });

  it("reports health and failures", async () => {
    expect(await read.accountHealth(account)).toMatchObject({ ok: true, inbox: { messages: 0 } });
    expect(await read.accountHealth({ ...account, id: "broken" })).toMatchObject({
      ok: false,
      error: expect.stringMatching(/Authentication/),
    });
  });
});

describe("recurring scan", () => {
  it("scans recent messages only and groups them", async () => {
    for (let i = 0; i < 3; i++) imap.seed("INBOX", { from: "n@shop.example", subject: `p${i}`, headers: { "List-Id": "<news.shop>" } });
    imap.seed("INBOX", { from: "n@shop.example", subject: "old", headers: { "List-Id": "<news.shop>" }, date: new Date("2020-01-01") });
    const scan = await scanRecurring([account, { ...account, id: "broken" }], { days: 30, folder: "INBOX", minCount: 3, maxScan: 100 });
    expect(scan.scanned).toBe(3);
    expect(scan.senders[0]).toMatchObject({ key: "news.shop", count: 3 });
    expect(scan.errors).toHaveLength(1);
  });
});

describe("drafts", () => {
  it("creates a draft in the Drafts special-use folder", async () => {
    const res = await drafts.createDraft(account, { to: ["k@example.org"], subject: "Hello", body: "Text" });
    expect(res.folder).toBe("Drafts");
    expect(res.ref).toBe(encodeRef({ accountId: "me", folder: "Drafts", uid: 1 }));
    const stored = imap.folders.get("Drafts")!.messages.get(1)!;
    expect(stored.flags.has("\\Draft")).toBe(true);
    expect(stored.source).toMatch(/^Subject: Hello$/m);
  });

  it("creates the Drafts folder when the server has none", async () => {
    imap = new FakeImap("/");
    servers.set("me", imap);
    const res = await drafts.createDraft({ ...account, displayName: "Me" }, { to: ["k@example.org"], subject: "Hi", body: "x" });
    expect(res.folder).toBe("Drafts");
    expect(imap.folders.get("Drafts")!.messages.get(1)!.source).toMatch(/^From: "?Me"? <moi@example.com>$/m);
  });

  it("replies with threading headers and Re: prefix", async () => {
    const m = imap.seed("INBOX", {
      from: "k@example.org",
      subject: "Thursday",
      source: [
        "From: Karim <k@example.org>",
        "To: moi@example.com, other@example.org",
        "Cc: third@example.org",
        "Subject: Thursday",
        "Message-ID: <orig@example.org>",
        "References: <older@example.org>",
        "",
        "2pm?",
      ].join("\r\n"),
    });
    await drafts.createReply(account, { accountId: "me", folder: "INBOX", uid: m.uid }, "Yes", true);
    const raw = imap.folders.get("Drafts")!.messages.get(1)!.source!;
    expect(raw).toMatch(/^Subject: Re: Thursday$/m);
    expect(raw).toMatch(/^In-Reply-To: <orig@example.org>$/m);
    expect(raw).toMatch(/^References: <older@example.org> <orig@example.org>$/m);
    expect(raw).toMatch(/^To: k@example.org$/m);
    expect(raw).toMatch(/^Cc: other@example.org, third@example.org$/m);
  });

  it("does not stack Re: prefixes", async () => {
    const m = imap.seed("INBOX", {
      from: "k@example.org",
      subject: "Re: Thursday",
      source: "From: k@example.org\r\nSubject: Re: Thursday\r\n\r\nx",
    });
    await drafts.createReply(account, { accountId: "me", folder: "INBOX", uid: m.uid }, "ok", false);
    expect(imap.folders.get("Drafts")!.messages.get(1)!.source).toMatch(/^Subject: Re: Thursday$/m);
  });

  it("sends a draft, files it in Sent and removes the draft", async () => {
    const d = await drafts.createDraft(account, { to: ["k@example.org"], cc: ["c@example.org"], subject: "Go", body: "x" });
    const res = await drafts.sendDraft(account, decodeRef(d.ref!));
    expect(res.to).toEqual(["k@example.org", "c@example.org"]);
    expect(sent[0].envelope).toEqual({ from: "moi@example.com", to: ["k@example.org", "c@example.org"] });
    expect(imap.count("Sent")).toBe(1);
    expect(imap.count("Drafts")).toBe(0);
  });

  it("lets Gmail file sent messages itself", async () => {
    const g = new FakeImap("/", { "[Gmail]/Sent Mail": "\\Sent", "[Gmail]/Drafts": "\\Drafts" });
    servers.set("g", g);
    const d = await drafts.createDraft(gmail, { to: ["k@example.org"], subject: "Go", body: "x" });
    await drafts.sendDraft(gmail, decodeRef(d.ref!));
    expect(g.count("[Gmail]/Sent Mail")).toBe(0);
  });

  it("refuses a draft without recipients", async () => {
    const m = imap.seed("Drafts", { from: "moi@example.com", subject: "x", source: "From: moi@example.com\r\nSubject: x\r\n\r\nbody" });
    await expect(drafts.sendDraft(account, { accountId: "me", folder: "Drafts", uid: m.uid })).rejects.toThrow(/no recipient/);
    expect(sent).toEqual([]);
  });
});
