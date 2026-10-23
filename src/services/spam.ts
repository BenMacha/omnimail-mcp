import type { ParsedMail } from "mailparser";
import { baseDomain, domainOf, extractAddress } from "../headers.js";
import { stripTags } from "../text.js";

export interface SpamReport {
  score: number;
  verdict: "likely legitimate" | "suspicious" | "very suspicious";
  auth: { spf?: string; dkim?: string; dmarc?: string };
  reasons: string[];
}

const FREEMAIL = [
  "gmail.com",
  "yahoo.com",
  "yahoo.fr",
  "hotmail.com",
  "hotmail.fr",
  "outlook.com",
  "outlook.fr",
  "live.fr",
  "aol.com",
  "gmx.com",
  "gmx.fr",
  "icloud.com",
  "laposte.net",
  "orange.fr",
  "free.fr",
  "proton.me",
];
const BRANDS =
  /(paypal|amazon|apple|icloud|microsoft|netflix|banque|bank|impots|ameli|caf|la poste|colissimo|chronopost|dhl|ups|fedex|sncf|edf|engie|orange|sfr|free mobile|bouygues|crédit|credit|société générale|bnp|lcl|boursorama|revolut|antai|cpf)/i;
const URGENT =
  /(urgent|عاجل|حسابك معلق|تم تعليق|تحقق من حسابك|immédiatement|immediately|suspendu|suspended|bloqué|locked|dernier rappel|final notice|vérifiez votre compte|verify your account|action requise|action required|expire aujourd'hui|colis en attente|frais de livraison|remboursement en attente)/i;
const RIB =
  /(تغيير الحساب البنكي|رقم حساب جديد|nouveau (rib|iban)|changement de (rib|iban|coordonnées bancaires)|new (bank details|iban))/i;
const DANGEROUS_EXT = /\.(exe|scr|bat|cmd|com|js|jse|vbs|vbe|wsf|msi|ps1|jar|iso|img|lnk|hta|html?|svg)$/i;

function authValue(results: string, method: string): string | undefined {
  return results.match(new RegExp(`\\b${method}=([a-z]+)`, "i"))?.[1]?.toLowerCase();
}

function headerText(parsed: ParsedMail, name: string): string {
  const v = parsed.headers.get(name);
  if (!v) return "";
  if (Array.isArray(v)) return v.map(String).join(" ; ");
  return typeof v === "string" ? v : JSON.stringify(v);
}

/** Heuristic score 0–100: authentication, spoofing, urgency, links, attachments. */
export function scoreMessage(parsed: ParsedMail): SpamReport {
  const reasons: string[] = [];
  let score = 0;
  const add = (points: number, reason: string) => {
    score += points;
    reasons.push(`+${points} ${reason}`);
  };

  const results = headerText(parsed, "authentication-results");
  const auth = { spf: authValue(results, "spf"), dkim: authValue(results, "dkim"), dmarc: authValue(results, "dmarc") };
  if (auth.dmarc === "fail") add(40, "DMARC failed: the displayed sender is not authenticated");
  if (auth.spf === "fail") add(20, "SPF failed");
  else if (auth.spf === "softfail") add(10, "SPF softfail");
  if (auth.dkim === "fail") add(15, "invalid DKIM signature");

  const fromValue = parsed.from?.value?.[0];
  const fromAddress = fromValue?.address?.toLowerCase();
  const fromDomain = domainOf(fromAddress);
  const displayName = fromValue?.name ?? "";

  const nameEmail = extractAddress(displayName);
  if (nameEmail && nameEmail !== fromAddress) add(25, `display name contains another address (${nameEmail})`);

  if (BRANDS.test(displayName) && fromDomain && FREEMAIL.includes(fromDomain)) {
    add(25, `claims to be "${displayName}" from a free mailbox (${fromDomain})`);
  }

  const replyTo = parsed.replyTo?.value?.[0]?.address?.toLowerCase();
  if (replyTo && baseDomain(domainOf(replyTo)) !== baseDomain(fromDomain)) {
    add(15, `replies go to another domain (${domainOf(replyTo)})`);
  }

  if (fromDomain && (fromDomain.includes("xn--") || /[^\x00-\x7f]/.test(fromDomain))) {
    add(20, "internationalized (punycode) domain: characters may imitate another domain");
  }

  const subject = parsed.subject ?? "";
  const text = `${subject}\n${parsed.text ?? ""}`;
  if (URGENT.test(text)) add(10, "urgent tone or account-lock threat");
  if (RIB.test(text)) add(20, "request to change bank details");

  const html = parsed.html || "";
  const links = [...html.matchAll(/<a\s[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)];
  let mismatched = 0;
  let ipLinks = 0;
  for (const [, href, inner] of links) {
    try {
      const target = new URL(href);
      if (/^\d+\.\d+\.\d+\.\d+$/.test(target.hostname)) ipLinks++;
      const shown = stripTags(inner)
        .trim()
        .match(/(?:https?:\/\/)?([a-z0-9-]+(?:\.[a-z0-9-]+)+)/i)?.[1];
      if (shown && baseDomain(shown.toLowerCase()) !== baseDomain(target.hostname.toLowerCase())) mismatched++;
    } catch {
      // relative link: ignored
    }
  }
  if (mismatched) add(Math.min(30, 15 * mismatched), `${mismatched} link(s) whose text shows a different domain than the real target`);
  if (ipLinks) add(20, `${ipLinks} link(s) to a raw IP address`);

  const dangerous = parsed.attachments.filter((a) => DANGEROUS_EXT.test(a.filename ?? ""));
  if (dangerous.length) add(30, `risky attachment(s): ${dangerous.map((a) => a.filename).join(", ")}`);

  score = Math.min(100, score);
  const verdict = score >= 50 ? "very suspicious" : score >= 25 ? "suspicious" : "likely legitimate";
  if (!results) reasons.push("no Authentication-Results header: authentication cannot be checked");
  return { score, verdict, auth, reasons };
}
