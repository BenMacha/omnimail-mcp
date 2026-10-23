import { baseDomain, domainOf } from "../headers.js";
import type { MessageSummary } from "./read.js";

/** Sorting categories, by priority. Folder names are localized in i18n.ts. */
export const CATEGORIES = [
  "security",
  "invoices",
  "banking",
  "administration",
  "travel",
  "orders",
  "social",
  "newsletters",
  "notifications",
] as const;

export type Category = (typeof CATEGORIES)[number];

const DOMAINS: Partial<Record<Category, string[]>> = {
  banking: [
    "bnpparibas.com",
    "bnpparibas",
    "societegenerale.fr",
    "credit-agricole.fr",
    "lcl.fr",
    "boursorama.com",
    "boursobank.com",
    "labanquepostale.fr",
    "caisse-epargne.fr",
    "banquepopulaire.fr",
    "creditmutuel.fr",
    "cic.fr",
    "revolut.com",
    "paypal.com",
    "paypal.fr",
    "qonto.com",
    "n26.com",
    "wise.com",
    "shine.fr",
    "fortuneo.fr",
    "hellobank.fr",
    "lydia-app.com",
    "sumeria.eu",
    "biat.com.tn",
    "stb.com.tn",
    "attijaribank.com.tn",
  ],
  administration: [
    "impots.gouv.fr",
    "dgfip.finances.gouv.fr",
    "ameli.fr",
    "caf.fr",
    "urssaf.fr",
    "service-public.fr",
    "ants.gouv.fr",
    "francetravail.fr",
    "pole-emploi.fr",
    "info-retraite.fr",
    "assurance-maladie.fr",
  ],
  travel: [
    "booking.com",
    "airbnb.com",
    "airbnb.fr",
    "sncf-connect.com",
    "sncf.fr",
    "airfrance.fr",
    "airfrance.com",
    "ryanair.com",
    "easyjet.com",
    "transavia.com",
    "tunisair.com.tn",
    "expedia.com",
    "expedia.fr",
    "blablacar.com",
    "ouigo.com",
    "trainline.com",
    "uber.com",
    "hotels.com",
    "accor.com",
  ],
  orders: [
    "amazon.fr",
    "amazon.com",
    "cdiscount.com",
    "fnac.com",
    "darty.com",
    "laposte.fr",
    "colissimo.fr",
    "chronopost.fr",
    "ups.com",
    "dhl.com",
    "fedex.com",
    "vinted.fr",
    "leboncoin.fr",
    "aliexpress.com",
    "zalando.fr",
    "mondialrelay.fr",
    "dpd.fr",
    "gls-france.com",
    "temu.com",
    "shein.com",
    "ikea.com",
  ],
  social: [
    "facebookmail.com",
    "facebook.com",
    "linkedin.com",
    "x.com",
    "twitter.com",
    "instagram.com",
    "tiktok.com",
    "youtube.com",
    "pinterest.com",
    "reddit.com",
    "redditmail.com",
    "snapchat.com",
    "discord.com",
    "threads.net",
    "mastodon.social",
    "bsky.app",
  ],
};

/** Subject keywords in English, French and Arabic. */
const SUBJECT_RULES: [Category, RegExp][] = [
  [
    "security",
    /(code de (vérification|confirmation|sécurité)|verification code|security code|mot de passe|password|nouvelle connexion|new sign[- ]?in|alerte de sécurité|security alert|authentification|one[- ]time|\bOTP\b|2FA|رمز التحقق|كلمة المرور|تنبيه أمني)/i,
  ],
  ["invoices", /(facture|invoice|reçu|receipt|avis d'échéance|échéancier|quittance|votre paiement|payment received|bill\b|فاتورة|إيصال)/i],
  ["banking", /(relevé de compte|relevé bancaire|virement|prélèvement|carte bancaire|bank statement|wire transfer|كشف حساب|تحويل بنكي)/i],
  [
    "travel",
    /(réservation|booking|billet|e-?ticket|carte d'embarquement|boarding pass|check-?in|itinéraire|itinerary|vol\s|flight|حجز|تذكرة|رحلة)/i,
  ],
  ["orders", /(commande|order|livraison|delivery|expédi|shipped|colis|parcel|suivi de|tracking|طلبك|توصيل|شحنة)/i],
];

function matchesDomain(domain: string | undefined, list: string[] | undefined): boolean {
  if (!domain || !list) return false;
  return list.some((d) => domain === d || domain.endsWith(`.${d}`) || baseDomain(domain)?.startsWith(`${d}.`));
}

/** Category of a message, or undefined when it should stay where it is. */
export function categorize(m: MessageSummary): Category | undefined {
  const domain = domainOf(m.fromAddress);
  const subject = m.subject ?? "";
  for (const [category, re] of SUBJECT_RULES) {
    if (category === "security" && re.test(subject)) return category;
  }
  for (const category of ["banking", "administration"] as const) {
    if (matchesDomain(domain, DOMAINS[category])) return category;
  }
  for (const [category, re] of SUBJECT_RULES) {
    if (category !== "security" && re.test(subject)) return category;
  }
  for (const category of ["travel", "orders", "social"] as const) {
    if (matchesDomain(domain, DOMAINS[category])) return category;
  }
  const isList = Boolean(m.listId || m.unsubscribe.http.length || m.unsubscribe.mailto.length || /bulk|list/i.test(m.precedence ?? ""));
  if (isList) return "newsletters";
  const auto =
    (m.autoSubmitted && m.autoSubmitted !== "no") ||
    /^(no-?reply|notifications?|alerts?|mailer-daemon|do-?not-?reply)@/i.test(m.fromAddress ?? "");
  if (auto) return "notifications";
  return undefined;
}

/** Safe folder name derived from a sender name. */
export function folderName(value: string, fallback = "Misc"): string {
  return (
    value
      .replace(/[\\/"*%]/g, " ")
      .replace(/[.]/g, "-")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 60) || fallback
  );
}

export interface CustomRule {
  /** Substring searched in the sender address. */
  from?: string;
  /** Case-insensitive regular expression applied to the subject. */
  subject?: string;
  /** Substring of the List-Id header. */
  listId?: string;
  /** Destination folder, segments separated by "/" (e.g. "Work/Clients"). */
  folder: string;
}

export function matchCustomRule(m: MessageSummary, rules: CustomRule[]): string[] | undefined {
  for (const r of rules) {
    if (!r.from && !r.subject && !r.listId) continue;
    if (r.from && !(m.fromAddress ?? "").includes(r.from.toLowerCase())) continue;
    if (r.subject && !new RegExp(r.subject, "i").test(m.subject ?? "")) continue;
    if (r.listId && !(m.listId ?? "").toLowerCase().includes(r.listId.toLowerCase())) continue;
    return r.folder
      .split("/")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return undefined;
}

export type ClassifyMode = "category" | "sender";

export interface ClassifyOptions {
  categories?: string[];
  rules?: CustomRule[];
  /** Localized category folder names. */
  labels: Record<Category, string>;
  misc?: string;
}

/** Destination folder segments for a message, or undefined when it stays in place. */
export function destinationFor(m: MessageSummary, mode: ClassifyMode, root: string, opts: ClassifyOptions): string[] | undefined {
  const custom = opts.rules?.length ? matchCustomRule(m, opts.rules) : undefined;
  if (custom) return custom;
  const category = categorize(m);
  if (!category) return undefined;
  if (opts.categories?.length && !opts.categories.includes(category)) return undefined;
  const label = opts.labels[category];
  if (mode === "category") return [root, label];
  const name = m.from?.match(/^(.*?)\s*</)?.[1]?.replace(/^"|"$/g, "") || baseDomain(domainOf(m.fromAddress)) || opts.misc || "Misc";
  return [root, label, folderName(name, opts.misc)];
}
