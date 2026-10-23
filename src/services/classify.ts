import { baseDomain, domainOf } from "../headers.js";
import type { MessageSummary } from "./read.js";

/** Catégories de classement, dans l'ordre de priorité. */
export const CATEGORIES = [
  "Sécurité",
  "Factures",
  "Banque",
  "Administratif",
  "Voyages",
  "Commandes",
  "Réseaux sociaux",
  "Newsletters",
  "Notifications",
] as const;

export type Category = (typeof CATEGORIES)[number];

const DOMAINS: Partial<Record<Category, string[]>> = {
  Banque: [
    "bnpparibas.com", "bnpparibas", "societegenerale.fr", "credit-agricole.fr", "lcl.fr", "boursorama.com",
    "boursobank.com", "labanquepostale.fr", "caisse-epargne.fr", "banquepopulaire.fr", "creditmutuel.fr",
    "cic.fr", "revolut.com", "paypal.com", "paypal.fr", "qonto.com", "n26.com", "wise.com", "shine.fr",
    "fortuneo.fr", "hellobank.fr", "lydia-app.com", "sumeria.eu",
  ],
  Administratif: [
    "impots.gouv.fr", "dgfip.finances.gouv.fr", "ameli.fr", "caf.fr", "urssaf.fr", "service-public.fr",
    "ants.gouv.fr", "francetravail.fr", "pole-emploi.fr", "info-retraite.fr", "assurance-maladie.fr",
  ],
  Voyages: [
    "booking.com", "airbnb.com", "airbnb.fr", "sncf-connect.com", "sncf.fr", "airfrance.fr", "airfrance.com",
    "ryanair.com", "easyjet.com", "transavia.com", "tunisair.com.tn", "expedia.com", "expedia.fr",
    "blablacar.com", "ouigo.com", "trainline.com", "uber.com", "hotels.com", "accor.com",
  ],
  Commandes: [
    "amazon.fr", "amazon.com", "cdiscount.com", "fnac.com", "darty.com", "laposte.fr", "colissimo.fr",
    "chronopost.fr", "ups.com", "dhl.com", "fedex.com", "vinted.fr", "leboncoin.fr", "aliexpress.com",
    "zalando.fr", "mondialrelay.fr", "dpd.fr", "gls-france.com", "temu.com", "shein.com", "ikea.com",
  ],
  "Réseaux sociaux": [
    "facebookmail.com", "facebook.com", "linkedin.com", "x.com", "twitter.com", "instagram.com",
    "tiktok.com", "youtube.com", "pinterest.com", "reddit.com", "redditmail.com", "snapchat.com",
    "discord.com", "threads.net", "mastodon.social", "bsky.app",
  ],
};

const SUBJECT_RULES: [Category, RegExp][] = [
  [
    "Sécurité",
    /(code de (vérification|confirmation|sécurité)|verification code|security code|mot de passe|password|nouvelle connexion|new sign[- ]?in|alerte de sécurité|security alert|authentification|one[- ]time|\bOTP\b|2FA)/i,
  ],
  ["Factures", /(facture|invoice|reçu|receipt|avis d'échéance|échéancier|quittance|votre paiement|payment received|bill\b)/i],
  ["Banque", /(relevé de compte|relevé bancaire|virement|prélèvement|carte bancaire|bank statement)/i],
  ["Voyages", /(réservation|booking|billet|e-?ticket|carte d'embarquement|boarding pass|check-?in|itinéraire|vol\s|flight)/i],
  ["Commandes", /(commande|order|livraison|delivery|expédi|shipped|colis|parcel|suivi de|tracking)/i],
];

function matchesDomain(domain: string | undefined, list: string[] | undefined): boolean {
  if (!domain || !list) return false;
  return list.some((d) => domain === d || domain.endsWith(`.${d}`) || baseDomain(domain)?.startsWith(`${d}.`));
}

/** Catégorie d'un message, ou undefined s'il doit rester où il est. */
export function categorize(m: MessageSummary): Category | undefined {
  const domain = domainOf(m.fromAddress);
  const subject = m.subject ?? "";
  for (const [category, re] of SUBJECT_RULES) {
    if (category === "Sécurité" && re.test(subject)) return category;
  }
  for (const category of ["Banque", "Administratif"] as const) {
    if (matchesDomain(domain, DOMAINS[category])) return category;
  }
  for (const [category, re] of SUBJECT_RULES) {
    if (category !== "Sécurité" && re.test(subject)) return category;
  }
  for (const category of ["Voyages", "Commandes", "Réseaux sociaux"] as const) {
    if (matchesDomain(domain, DOMAINS[category])) return category;
  }
  const isList = Boolean(m.listId || m.unsubscribe.http.length || m.unsubscribe.mailto.length || /bulk|list/i.test(m.precedence ?? ""));
  if (isList) return "Newsletters";
  const auto = (m.autoSubmitted && m.autoSubmitted !== "no") || /^(no-?reply|notifications?|alerts?|mailer-daemon|do-?not-?reply)@/i.test(m.fromAddress ?? "");
  if (auto) return "Notifications";
  return undefined;
}

/** Nom de dossier sûr à partir d'un nom d'expéditeur. */
export function folderName(value: string): string {
  return (
    value
      .replace(/[\\/"*%]/g, " ")
      .replace(/[.]/g, "-")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 60) || "Divers"
  );
}

export interface CustomRule {
  /** Sous-chaîne recherchée dans l'adresse de l'expéditeur. */
  from?: string;
  /** Expression régulière (insensible à la casse) appliquée à l'objet. */
  subject?: string;
  /** Sous-chaîne de l'en-tête List-Id. */
  listId?: string;
  /** Dossier de destination, segments séparés par "/" (ex. "Pro/Clients"). */
  folder: string;
}

export function matchCustomRule(m: MessageSummary, rules: CustomRule[]): string[] | undefined {
  for (const r of rules) {
    if (r.from && !(m.fromAddress ?? "").includes(r.from.toLowerCase())) continue;
    if (r.subject && !new RegExp(r.subject, "i").test(m.subject ?? "")) continue;
    if (r.listId && !(m.listId ?? "").toLowerCase().includes(r.listId.toLowerCase())) continue;
    if (!r.from && !r.subject && !r.listId) continue;
    return r.folder.split("/").map((s) => s.trim()).filter(Boolean);
  }
  return undefined;
}

export type ClassifyMode = "categorie" | "expediteur";

/** Segments du dossier de destination d'un message, ou undefined s'il reste en place. */
export function destinationFor(
  m: MessageSummary,
  mode: ClassifyMode,
  root: string,
  opts: { categories?: string[]; rules?: CustomRule[] } = {},
): string[] | undefined {
  const custom = opts.rules?.length ? matchCustomRule(m, opts.rules) : undefined;
  if (custom) return custom;
  const category = categorize(m);
  if (!category) return undefined;
  if (opts.categories?.length && !opts.categories.includes(category)) return undefined;
  if (mode === "categorie") return [root, category];
  const name = m.from?.match(/^(.*?)\s*</)?.[1]?.replace(/^"|"$/g, "") || baseDomain(domainOf(m.fromAddress)) || "Divers";
  return [root, category, folderName(name)];
}
