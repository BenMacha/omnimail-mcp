import type { ParsedMail } from "mailparser";
import { baseDomain, domainOf, extractAddress } from "../headers.js";

export interface SpamReport {
  score: number;
  verdict: "légitime probable" | "suspect" | "très suspect";
  auth: { spf?: string; dkim?: string; dmarc?: string };
  reasons: string[];
}

const FREEMAIL = ["gmail.com", "yahoo.com", "yahoo.fr", "hotmail.com", "hotmail.fr", "outlook.com", "outlook.fr", "live.fr", "aol.com", "gmx.com", "gmx.fr", "icloud.com", "laposte.net", "orange.fr", "free.fr", "proton.me"];
const BRANDS = /(paypal|amazon|apple|icloud|microsoft|netflix|banque|bank|impots|ameli|caf|la poste|colissimo|chronopost|dhl|ups|fedex|sncf|edf|engie|orange|sfr|free mobile|bouygues|crédit|credit|société générale|bnp|lcl|boursorama|revolut|antai|cpf)/i;
const URGENT = /(urgent|immédiatement|immediately|suspendu|suspended|bloqué|locked|dernier rappel|final notice|vérifiez votre compte|verify your account|action requise|action required|expire aujourd'hui|colis en attente|frais de livraison|remboursement en attente)/i;
const RIB = /(nouveau (rib|iban)|changement de (rib|iban|coordonnées bancaires)|new (bank details|iban))/i;
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

/** Score heuristique 0–100 : authentification, usurpation, urgence, liens, pièces jointes. */
export function scoreMessage(parsed: ParsedMail): SpamReport {
  const reasons: string[] = [];
  let score = 0;
  const add = (points: number, reason: string) => {
    score += points;
    reasons.push(`+${points} ${reason}`);
  };

  const results = headerText(parsed, "authentication-results");
  const auth = { spf: authValue(results, "spf"), dkim: authValue(results, "dkim"), dmarc: authValue(results, "dmarc") };
  if (auth.dmarc === "fail") add(40, "DMARC en échec : l'expéditeur affiché n'est pas authentifié");
  if (auth.spf === "fail") add(20, "SPF en échec");
  else if (auth.spf === "softfail") add(10, "SPF en échec léger (softfail)");
  if (auth.dkim === "fail") add(15, "signature DKIM invalide");

  const fromValue = parsed.from?.value?.[0];
  const fromAddress = fromValue?.address?.toLowerCase();
  const fromDomain = domainOf(fromAddress);
  const displayName = fromValue?.name ?? "";

  const nameEmail = extractAddress(displayName);
  if (nameEmail && nameEmail !== fromAddress) add(25, `le nom affiché contient une autre adresse (${nameEmail})`);

  if (BRANDS.test(displayName) && fromDomain && FREEMAIL.includes(fromDomain)) {
    add(25, `se présente comme « ${displayName} » depuis une messagerie gratuite (${fromDomain})`);
  }

  const replyTo = parsed.replyTo?.value?.[0]?.address?.toLowerCase();
  if (replyTo && baseDomain(domainOf(replyTo)) !== baseDomain(fromDomain)) {
    add(15, `les réponses partent vers un autre domaine (${domainOf(replyTo)})`);
  }

  if (fromDomain?.includes("xn--")) add(20, "domaine en punycode (caractères imitant un autre domaine)");

  const subject = parsed.subject ?? "";
  const text = `${subject}\n${parsed.text ?? ""}`;
  if (URGENT.test(text)) add(10, "ton d'urgence ou menace de blocage");
  if (RIB.test(text)) add(20, "demande de changement de coordonnées bancaires");

  const html = parsed.html || "";
  const links = [...html.matchAll(/<a\s[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)];
  let mismatched = 0;
  let ipLinks = 0;
  for (const [, href, inner] of links) {
    try {
      const target = new URL(href);
      if (/^\d+\.\d+\.\d+\.\d+$/.test(target.hostname)) ipLinks++;
      const shown = inner.replace(/<[^>]+>/g, "").trim().match(/(?:https?:\/\/)?([a-z0-9-]+(?:\.[a-z0-9-]+)+)/i)?.[1];
      if (shown && baseDomain(shown.toLowerCase()) !== baseDomain(target.hostname.toLowerCase())) mismatched++;
    } catch {
      // lien non absolu : ignoré
    }
  }
  if (mismatched) add(Math.min(30, 15 * mismatched), `${mismatched} lien(s) dont le texte affiche un autre domaine que la vraie destination`);
  if (ipLinks) add(20, `${ipLinks} lien(s) vers une adresse IP brute`);

  const dangerous = parsed.attachments.filter((a) => DANGEROUS_EXT.test(a.filename ?? ""));
  if (dangerous.length) add(30, `pièce(s) jointe(s) à risque : ${dangerous.map((a) => a.filename).join(", ")}`);

  score = Math.min(100, score);
  const verdict = score >= 50 ? "très suspect" : score >= 25 ? "suspect" : "légitime probable";
  if (!results) reasons.push("aucun en-tête Authentication-Results : authentification non vérifiable");
  return { score, verdict, auth, reasons };
}
