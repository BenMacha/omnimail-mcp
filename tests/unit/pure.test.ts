import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { simpleParser } from "mailparser";
import { describe, expect, it } from "vitest";
import { baseDomain, domainOf, extractAddress, header, parseHeaders, parseListUnsubscribe } from "../../src/headers.js";
import { FOLDER_NAMES, folderNames, sortRoot } from "../../src/i18n.js";
import { decodeRef, encodeRef, groupRefs } from "../../src/refs.js";
import { categorize, destinationFor, folderName, matchCustomRule } from "../../src/services/classify.js";
import type { MessageSummary } from "../../src/services/read.js";
import { groupKey, groupRecurring, unsubscribeMethod } from "../../src/services/recurring.js";
import { scoreMessage } from "../../src/services/spam.js";
import { Vault } from "../../src/vault.js";

function summary(p: Partial<MessageSummary>): MessageSummary {
  return {
    ref: encodeRef({ accountId: "a", folder: "INBOX", uid: Math.floor(Math.random() * 1e6) }),
    accountId: "a",
    folder: "INBOX",
    uid: 1,
    seen: false,
    flagged: false,
    unsubscribe: { http: [], mailto: [], oneClick: false },
    ...p,
  };
}

const en = { labels: FOLDER_NAMES.en.categories, misc: FOLDER_NAMES.en.misc };

describe("headers", () => {
  it("unfolds multi-line headers and keeps repeated ones", () => {
    const h = parseHeaders(
      "List-Unsubscribe: <https://x.example/u>,\r\n <mailto:u@x.example>\r\nReceived: a\r\nReceived: b\r\nbroken line\r\n",
    );
    expect(header(h, "List-Unsubscribe")).toBe("<https://x.example/u>, <mailto:u@x.example>");
    expect(h.get("received")).toEqual(["a", "b"]);
    expect(parseHeaders(undefined).size).toBe(0);
  });

  it("detects RFC 8058 one-click unsubscribe", () => {
    const u = parseListUnsubscribe("<https://x.example/u>, <mailto:u@x.example>", "List-Unsubscribe=One-Click");
    expect(u).toEqual({ http: ["https://x.example/u"], mailto: ["mailto:u@x.example"], oneClick: true });
  });

  it("refuses one-click without an https link", () => {
    expect(parseListUnsubscribe("<http://x.example/u>", "List-Unsubscribe=One-Click").oneClick).toBe(false);
    expect(parseListUnsubscribe("<https://x.example/u>").oneClick).toBe(false);
    expect(parseListUnsubscribe(undefined)).toEqual({ http: [], mailto: [], oneClick: false });
  });

  it("extracts addresses and domains", () => {
    expect(extractAddress('"Shop" <News@Shop.Example>')).toBe("news@shop.example");
    expect(extractAddress("plain@example.org")).toBe("plain@example.org");
    expect(extractAddress(undefined)).toBeUndefined();
    expect(domainOf("a@B.example")).toBe("b.example");
    expect(baseDomain("mail.news.example.co.uk")).toBe("example.co.uk");
    expect(baseDomain("a.b.example.com")).toBe("example.com");
    expect(baseDomain("www.biat.com.tn")).toBe("biat.com.tn");
    expect(baseDomain(undefined)).toBeUndefined();
  });
});

describe("references", () => {
  it("round-trips folders containing separators", () => {
    const ref = { accountId: "me-icloud-com", folder: "Sorted/Invoices|2026", uid: 42 };
    expect(decodeRef(encodeRef(ref))).toEqual(ref);
  });

  it("rejects malformed references", () => {
    expect(() => decodeRef("nope")).toThrow(/Invalid/);
    expect(() => decodeRef("a|INBOX|x")).toThrow(/Invalid/);
  });

  it("groups references by account and folder", () => {
    const g = groupRefs([
      { accountId: "a", folder: "INBOX", uid: 1 },
      { accountId: "a", folder: "INBOX", uid: 2 },
      { accountId: "a", folder: "X", uid: 3 },
      { accountId: "b", folder: "INBOX", uid: 4 },
    ]);
    expect(g.get("a")?.get("INBOX")).toEqual([1, 2]);
    expect(g.get("a")?.get("X")).toEqual([3]);
    expect(g.get("b")?.get("INBOX")).toEqual([4]);
  });
});

describe("vault", () => {
  it("encrypts, reads back and rejects a wrong key", () => {
    const file = join(mkdtempSync(join(tmpdir(), "vault-")), "v.enc");
    new Vault<{ x: string }>(file, () => "right-key").write({ x: "app-password" });
    expect(new Vault<{ x: string }>(file, () => "right-key").read({ x: "" })).toEqual({ x: "app-password" });
    expect(() => new Vault<{ x: string }>(file, () => "wrong").read({ x: "" })).toThrow(/decrypt/);
  });

  it("returns the fallback when the vault does not exist", () => {
    const file = join(mkdtempSync(join(tmpdir(), "vault-")), "missing.enc");
    expect(new Vault<{ n: number }>(file, () => "k").read({ n: 7 })).toEqual({ n: 7 });
  });

  it("uses a fresh salt and IV on every write", () => {
    const file = join(mkdtempSync(join(tmpdir(), "vault-")), "v.enc");
    const v = new Vault<{ x: string }>(file, () => "k");
    v.write({ x: "same" });
    const first = JSON.parse(readFileSync(file, "utf8"));
    v.write({ x: "same" });
    const second = JSON.parse(readFileSync(file, "utf8"));
    expect(first.iv).not.toBe(second.iv);
    expect(first.salt).not.toBe(second.salt);
    expect(first.data).not.toBe(second.data);
  });
});

describe("i18n", () => {
  it("localizes folder names in three languages", () => {
    expect(folderNames({ language: "en" }).categories.invoices).toBe("Invoices");
    expect(folderNames({ language: "fr" }).categories.invoices).toBe("Factures");
    expect(folderNames({ language: "ar" }).categories.invoices).toBe("الفواتير");
    expect(sortRoot({ language: "fr", classifyRoot: "" })).toBe("Classement");
    expect(sortRoot({ language: "ar", classifyRoot: "" })).toBe("مرتب");
    expect(sortRoot({ language: "en", classifyRoot: "Mine" })).toBe("Mine");
  });

  it("covers every category in every language", () => {
    for (const lang of Object.values(FOLDER_NAMES)) {
      expect(Object.keys(lang.categories).sort()).toEqual(Object.keys(FOLDER_NAMES.en.categories).sort());
    }
  });
});

describe("classification", () => {
  it.each([
    ["Votre facture d'octobre", "billing@edf.fr", "invoices"],
    ["Your invoice is ready", "billing@service.example", "invoices"],
    ["فاتورة شهر أكتوبر", "billing@ooredoo.tn", "invoices"],
    ["Votre code de vérification", "no-reply@bank.fr", "security"],
    ["رمز التحقق الخاص بك", "no-reply@service.tn", "security"],
    ["Relevé disponible", "info@boursobank.com", "banking"],
    ["Hello", "alerts@biat.com.tn", "banking"],
    ["Votre colis arrive", "x@amazon.fr", "orders"],
    ["Hi", "x@amazon.fr", "orders"],
    ["Booking confirmed", "x@hotel.example", "travel"],
    ["Hi", "noreply@airbnb.com", "travel"],
    ["Votre déclaration", "x@impots.gouv.fr", "administration"],
    ["Someone liked your post", "notify@facebookmail.com", "social"],
    ["Build passed", "notifications@github.com", "notifications"],
  ])("%s from %s → %s", (subject, fromAddress, expected) => {
    expect(categorize(summary({ subject, fromAddress }))).toBe(expected);
  });

  it("detects newsletters from list headers and precedence", () => {
    expect(categorize(summary({ subject: "News", listId: "<news.shop.example>" }))).toBe("newsletters");
    expect(categorize(summary({ subject: "News", precedence: "bulk" }))).toBe("newsletters");
    expect(categorize(summary({ subject: "News", unsubscribe: { http: ["https://x/u"], mailto: [], oneClick: false } }))).toBe(
      "newsletters",
    );
    expect(categorize(summary({ subject: "Report", autoSubmitted: "auto-generated" }))).toBe("notifications");
  });

  it("leaves personal mail in place", () => {
    expect(categorize(summary({ subject: "Lunch tomorrow?", fromAddress: "karim@example.org" }))).toBeUndefined();
    expect(categorize(summary({ subject: "Lunch", fromAddress: "k@example.org", autoSubmitted: "no" }))).toBeUndefined();
  });

  it("computes destinations by category, sender and rule", () => {
    const m = summary({ subject: "News", listId: "<n.shop>", from: '"Shop / News" <n@shop.example>', fromAddress: "n@shop.example" });
    expect(destinationFor(m, "category", "Sorted", en)).toEqual(["Sorted", "Newsletters"]);
    expect(destinationFor(m, "sender", "Sorted", en)).toEqual(["Sorted", "Newsletters", "Shop News"]);
    expect(destinationFor(m, "category", "Sorted", { ...en, rules: [{ from: "shop.example", folder: "Me/Shopping" }] })).toEqual([
      "Me",
      "Shopping",
    ]);
    expect(destinationFor(m, "category", "Sorted", { ...en, categories: ["invoices"] })).toBeUndefined();
    const noName = summary({ subject: "News", listId: "<x>", from: "n@mail.shop.example", fromAddress: "n@mail.shop.example" });
    expect(destinationFor(noName, "sender", "Sorted", en)).toEqual(["Sorted", "Newsletters", "shop-example"]);
  });

  it("matches custom rules on subject, list id and skips empty rules", () => {
    const m = summary({ subject: "Devis 42", listId: "<dev.github.com>", fromAddress: "a@b.c" });
    expect(matchCustomRule(m, [{ folder: "Empty" }, { subject: "^devis", folder: "Work/Quotes" }])).toEqual(["Work", "Quotes"]);
    expect(matchCustomRule(m, [{ listId: "GITHUB", folder: "Dev" }])).toEqual(["Dev"]);
    expect(matchCustomRule(m, [{ from: "zzz", folder: "No" }])).toBeUndefined();
  });

  it("builds safe folder names", () => {
    expect(folderName("a.b/c")).toBe("a-b c");
    expect(folderName("   ")).toBe("Misc");
    expect(folderName("", "Divers")).toBe("Divers");
    expect(folderName("x".repeat(100))).toHaveLength(60);
  });
});

describe("recurring senders", () => {
  it("groups by List-Id, then by sender", () => {
    const list = [
      ...[1, 2, 3].map((i) =>
        summary({
          listId: "Shop <news.shop.example>",
          fromAddress: "n@shop.example",
          from: "Shop <n@shop.example>",
          date: `2026-10-0${i}T00:00:00Z`,
          seen: i === 1,
          unsubscribe: { http: ["https://shop.example/u"], mailto: [], oneClick: true },
        }),
      ),
      summary({ fromAddress: "karim@example.org" }),
      summary({ fromAddress: "karim@example.org" }),
    ];
    const groups = groupRecurring(list, 3, 28);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({
      key: "news.shop.example",
      name: "Shop",
      count: 3,
      unread: 2,
      readRate: 0.33,
      perWeek: 0.8,
      firstDate: "2026-10-01T00:00:00Z",
      lastDate: "2026-10-03T00:00:00Z",
      unsubscribeMethod: "one-click",
    });
  });

  it("keeps list senders from two messages", () => {
    const list = [1, 2].map(() =>
      summary({ fromAddress: "n@x.example", unsubscribe: { http: [], mailto: ["mailto:u@x"], oneClick: false } }),
    );
    expect(groupRecurring(list, 3, 30)[0]).toMatchObject({ count: 2, unsubscribeMethod: "mailto" });
  });

  it("names the unsubscribe method", () => {
    expect(unsubscribeMethod({ http: ["https://a"], mailto: [], oneClick: true })).toBe("one-click");
    expect(unsubscribeMethod({ http: ["https://a"], mailto: ["mailto:a"], oneClick: false })).toBe("mailto");
    expect(unsubscribeMethod({ http: ["https://a"], mailto: [], oneClick: false })).toBe("link");
    expect(unsubscribeMethod({ http: [], mailto: [], oneClick: false })).toBe("none");
    expect(groupKey(summary({ fromAddress: undefined }))).toBe("unknown");
  });
});

describe("spam", () => {
  async function score(lines: string[]) {
    return scoreMessage(await simpleParser(lines.join("\r\n")));
  }

  it("flags typical phishing", async () => {
    const r = await score([
      'From: "PayPal Service" <secure@gmail.com>',
      "Reply-To: x@other.example",
      "Authentication-Results: mx; spf=fail; dkim=fail; dmarc=fail",
      "Subject: Account suspended",
      "Content-Type: text/html",
      "",
      '<a href="http://1.2.3.4/x">https://paypal.com</a>',
    ]);
    expect(r.verdict).toBe("very suspicious");
    expect(r.score).toBe(100);
    expect(r.auth).toEqual({ spf: "fail", dkim: "fail", dmarc: "fail" });
  });

  it("passes an authenticated personal message", async () => {
    const r = await score([
      "From: Karim <karim@example.org>",
      "Authentication-Results: mx; spf=pass; dkim=pass; dmarc=pass",
      "Subject: Thursday",
      "",
      "See you!",
    ]);
    expect(r).toMatchObject({ score: 0, verdict: "likely legitimate" });
  });

  it("notes missing authentication results", async () => {
    const r = await score(["From: a@b.example", "Subject: hi", "", "x"]);
    expect(r.reasons.join(" ")).toMatch(/no Authentication-Results/);
  });

  it.each([
    [['From: "support@bank.example" <x@evil.example>', "Subject: hi"], /display name contains another address/],
    [["From: a@xn--pypal-4ve.com", "Subject: hi"], /punycode/],
    [["From: a@b.example", "Subject: Nouveau RIB à utiliser"], /bank details/],
    [["From: a@b.example", "Subject: عاجل: تم تعليق حسابك"], /urgent/],
    [["From: a@b.example", "Authentication-Results: mx; spf=softfail", "Subject: hi"], /softfail/],
  ])("explains %#", async (lines, reason) => {
    const r = await score([...lines, "", "body"]);
    expect(r.reasons.join(" | ")).toMatch(reason);
  });

  it("flags dangerous attachments", async () => {
    const r = await score([
      "From: a@b.example",
      "Subject: invoice",
      'Content-Type: multipart/mixed; boundary="b"',
      "",
      "--b",
      "Content-Type: text/plain",
      "",
      "see attached",
      "--b",
      'Content-Type: application/octet-stream; name="invoice.exe"',
      'Content-Disposition: attachment; filename="invoice.exe"',
      "Content-Transfer-Encoding: base64",
      "",
      "TVqQAAMAAAAEAAAA",
      "--b--",
    ]);
    expect(r.reasons.join(" ")).toMatch(/risky attachment.*invoice\.exe/);
    expect(r.verdict).toBe("suspicious");
  });
});
