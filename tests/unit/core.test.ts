import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { simpleParser } from "mailparser";
import { baseDomain, extractAddress, parseHeaders, parseListUnsubscribe } from "../../src/headers.js";
import { decodeRef, encodeRef } from "../../src/refs.js";
import { Vault } from "../../src/vault.js";
import { categorize, destinationFor, folderName } from "../../src/services/classify.js";
import { groupRecurring } from "../../src/services/recurring.js";
import { isPrivateAddress, parseMailto } from "../../src/services/unsubscribe.js";
import { scoreMessage } from "../../src/services/spam.js";
import type { MessageSummary } from "../../src/services/read.js";

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

describe("en-têtes", () => {
  it("déplie les en-têtes multilignes", () => {
    const h = parseHeaders("List-Unsubscribe: <https://x.example/u>,\r\n <mailto:u@x.example>\r\nList-Id: News <news.x.example>\r\n");
    expect(h.get("list-unsubscribe")?.[0]).toBe("<https://x.example/u>, <mailto:u@x.example>");
  });

  it("reconnaît le désabonnement one-click RFC 8058", () => {
    const u = parseListUnsubscribe("<https://x.example/u>, <mailto:u@x.example>", "List-Unsubscribe=One-Click");
    expect(u).toEqual({ http: ["https://x.example/u"], mailto: ["mailto:u@x.example"], oneClick: true });
  });

  it("refuse le one-click sans lien https", () => {
    expect(parseListUnsubscribe("<http://x.example/u>", "List-Unsubscribe=One-Click").oneClick).toBe(false);
  });

  it("extrait adresses et domaines", () => {
    expect(extractAddress('"Shop" <News@Shop.Example>')).toBe("news@shop.example");
    expect(baseDomain("mail.news.example.co.uk")).toBe("example.co.uk");
    expect(baseDomain("a.b.example.com")).toBe("example.com");
  });
});

describe("références", () => {
  it("encode et décode un dossier avec séparateurs", () => {
    const ref = { accountId: "moi-icloud-com", folder: "Classement/Factures|2026", uid: 42 };
    expect(decodeRef(encodeRef(ref))).toEqual(ref);
  });
});

describe("coffre chiffré", () => {
  it("chiffre et relit, refuse une mauvaise clé", () => {
    const file = join(mkdtempSync(join(tmpdir(), "vault-")), "v.enc");
    new Vault<{ x: string }>(file, () => "bonne-cle").write({ x: "mot-de-passe-app" });
    expect(new Vault<{ x: string }>(file, () => "bonne-cle").read({ x: "" })).toEqual({ x: "mot-de-passe-app" });
    expect(() => new Vault<{ x: string }>(file, () => "mauvaise").read({ x: "" })).toThrow(/déchiffrer/);
  });
});

describe("classement", () => {
  it("catégorise", () => {
    expect(categorize(summary({ subject: "Votre facture d'octobre", fromAddress: "billing@edf.fr" }))).toBe("Factures");
    expect(categorize(summary({ subject: "Votre code de vérification", fromAddress: "no-reply@bank.fr" }))).toBe("Sécurité");
    expect(categorize(summary({ subject: "Relevé disponible", fromAddress: "info@boursobank.com" }))).toBe("Banque");
    expect(categorize(summary({ subject: "Votre colis arrive", fromAddress: "x@amazon.fr" }))).toBe("Commandes");
    expect(categorize(summary({ subject: "Nouveautés", listId: "<news.shop.example>" }))).toBe("Newsletters");
    expect(categorize(summary({ subject: "Build passed", fromAddress: "notifications@github.com" }))).toBe("Notifications");
    expect(categorize(summary({ subject: "On déjeune ?", fromAddress: "karim@example.org" }))).toBeUndefined();
  });

  it("calcule la destination par expéditeur et par règle", () => {
    const m = summary({ subject: "Nouveautés", listId: "<n.shop>", from: '"Shop / News" <n@shop.example>', fromAddress: "n@shop.example" });
    expect(destinationFor(m, "expediteur", "Classement")).toEqual(["Classement", "Newsletters", "Shop News"]);
    expect(destinationFor(m, "categorie", "Classement", { rules: [{ from: "shop.example", folder: "Perso/Shopping" }] })).toEqual(["Perso", "Shopping"]);
    expect(destinationFor(m, "categorie", "Classement", { categories: ["Factures"] })).toBeUndefined();
    expect(folderName("a.b/c")).toBe("a-b c");
  });
});

describe("envois récurrents", () => {
  it("regroupe par List-Id puis par expéditeur", () => {
    const list = [
      ...[1, 2, 3].map((i) => summary({ listId: "Shop <news.shop.example>", fromAddress: "n@shop.example", date: `2026-10-0${i}T00:00:00Z`, seen: i === 1, unsubscribe: { http: ["https://shop.example/u"], mailto: [], oneClick: true } })),
      summary({ fromAddress: "karim@example.org" }),
      summary({ fromAddress: "karim@example.org" }),
    ];
    const groups = groupRecurring(list, 3, 30);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ key: "news.shop.example", count: 3, unread: 2, unsubscribeMethod: "one-click" });
  });
});

describe("désabonnement", () => {
  it("bloque les adresses internes", () => {
    for (const ip of ["127.0.0.1", "10.1.2.3", "192.168.1.1", "172.20.0.1", "169.254.169.254", "::1", "fd00::1", "::ffff:10.0.0.1"]) {
      expect(isPrivateAddress(ip)).toBe(true);
    }
    expect(isPrivateAddress("93.184.216.34")).toBe(false);
  });

  it("lit un lien mailto", () => {
    expect(parseMailto("mailto:unsub@x.example?subject=stop&body=please")).toEqual({ to: "unsub@x.example", subject: "stop", text: "please" });
  });
});

describe("spam", () => {
  it("signale un hameçonnage typique", async () => {
    const parsed = await simpleParser(
      [
        'From: "PayPal Service" <secure@gmail.com>',
        "Reply-To: x@other.example",
        "Authentication-Results: mx; spf=fail; dkim=fail; dmarc=fail",
        "Subject: Compte suspendu",
        "Content-Type: text/html",
        "",
        '<a href="http://1.2.3.4/x">https://paypal.com</a>',
      ].join("\r\n"),
    );
    const r = scoreMessage(parsed);
    expect(r.verdict).toBe("très suspect");
    expect(r.score).toBe(100);
  });

  it("laisse passer un mail authentifié", async () => {
    const parsed = await simpleParser(
      ["From: Karim <karim@example.org>", "Authentication-Results: mx; spf=pass; dkim=pass; dmarc=pass", "Subject: Jeudi", "", "À jeudi !"].join("\r\n"),
    );
    expect(scoreMessage(parsed)).toMatchObject({ score: 0, verdict: "légitime probable" });
  });
});
