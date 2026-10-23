export interface ServerEndpoint {
  host: string;
  port: number;
  /** true = TLS direct, false = STARTTLS. */
  secure: boolean;
}

export interface Preset {
  id: string;
  label: string;
  imap: ServerEndpoint;
  smtp: ServerEndpoint;
  /** Page où créer un mot de passe d'application. */
  appPasswordUrl?: string;
  /** Certificat auto-signé accepté (Proton Mail Bridge sur le réseau Docker interne). */
  tlsInsecure?: boolean;
  /** Le fournisseur refuse les mots de passe : OAuth requis (pas encore pris en charge). */
  oauthOnly?: boolean;
  /** Gmail : recherche X-GM-RAW et libellés. */
  gmail?: boolean;
  note?: string;
}

const protonHost = process.env.OMNIMAIL_PROTON_BRIDGE_HOST ?? "proton-bridge";

export const PRESETS: Record<string, Preset> = {
  icloud: {
    id: "icloud",
    label: "iCloud Mail",
    imap: { host: "imap.mail.me.com", port: 993, secure: true },
    smtp: { host: "smtp.mail.me.com", port: 587, secure: false },
    appPasswordUrl: "https://account.apple.com/account/manage",
    note: "Identifiants de connexion et sécurité → Mots de passe pour app.",
  },
  gmail: {
    id: "gmail",
    label: "Gmail / Google Workspace",
    imap: { host: "imap.gmail.com", port: 993, secure: true },
    smtp: { host: "smtp.gmail.com", port: 465, secure: true },
    appPasswordUrl: "https://myaccount.google.com/apppasswords",
    gmail: true,
    note: "La validation en deux étapes doit être activée.",
  },
  yahoo: {
    id: "yahoo",
    label: "Yahoo Mail",
    imap: { host: "imap.mail.yahoo.com", port: 993, secure: true },
    smtp: { host: "smtp.mail.yahoo.com", port: 465, secure: true },
    appPasswordUrl: "https://login.yahoo.com/account/security",
  },
  aol: {
    id: "aol",
    label: "AOL Mail",
    imap: { host: "imap.aol.com", port: 993, secure: true },
    smtp: { host: "smtp.aol.com", port: 465, secure: true },
    appPasswordUrl: "https://login.aol.com/account/security",
  },
  infomaniak: {
    id: "infomaniak",
    label: "Infomaniak",
    imap: { host: "mail.infomaniak.com", port: 993, secure: true },
    smtp: { host: "mail.infomaniak.com", port: 465, secure: true },
    appPasswordUrl: "https://manager.infomaniak.com",
    note: "Mot de passe d'application obligatoire si la double authentification est active.",
  },
  proton: {
    id: "proton",
    label: "Proton Mail (via Proton Mail Bridge)",
    imap: { host: protonHost, port: 143, secure: false },
    smtp: { host: protonHost, port: 25, secure: false },
    tlsInsecure: true,
    note: "Lancer le service proton-bridge (profil Docker « proton ») et utiliser le mot de passe affiché par le Bridge.",
  },
  fastmail: {
    id: "fastmail",
    label: "Fastmail",
    imap: { host: "imap.fastmail.com", port: 993, secure: true },
    smtp: { host: "smtp.fastmail.com", port: 465, secure: true },
    appPasswordUrl: "https://app.fastmail.com/settings/security/apps",
  },
  zoho: {
    id: "zoho",
    label: "Zoho Mail (UE)",
    imap: { host: "imap.zoho.eu", port: 993, secure: true },
    smtp: { host: "smtp.zoho.eu", port: 465, secure: true },
  },
  gmx: {
    id: "gmx",
    label: "GMX",
    imap: { host: "imap.gmx.net", port: 993, secure: true },
    smtp: { host: "mail.gmx.net", port: 587, secure: false },
  },
  ovh: {
    id: "ovh",
    label: "OVHcloud (MX Plan)",
    imap: { host: "ssl0.ovh.net", port: 993, secure: true },
    smtp: { host: "ssl0.ovh.net", port: 465, secure: true },
  },
  outlook: {
    id: "outlook",
    label: "Outlook.com / Microsoft 365",
    imap: { host: "outlook.office365.com", port: 993, secure: true },
    smtp: { host: "smtp.office365.com", port: 587, secure: false },
    oauthOnly: true,
    note: "Microsoft n'accepte plus les mots de passe en IMAP : connexion OAuth prévue en phase 4.",
  },
};

export function presetForAddress(address: string): Preset | undefined {
  const domain = address.split("@")[1]?.toLowerCase() ?? "";
  if (["icloud.com", "me.com", "mac.com"].includes(domain)) return PRESETS.icloud;
  if (["gmail.com", "googlemail.com"].includes(domain)) return PRESETS.gmail;
  if (domain.startsWith("yahoo.") || domain === "ymail.com") return PRESETS.yahoo;
  if (domain === "aol.com") return PRESETS.aol;
  if (["ik.me", "ikmail.com", "etik.com"].includes(domain)) return PRESETS.infomaniak;
  if (["proton.me", "protonmail.com", "pm.me"].includes(domain)) return PRESETS.proton;
  if (domain === "fastmail.com") return PRESETS.fastmail;
  if (domain.startsWith("gmx.")) return PRESETS.gmx;
  if (["outlook.com", "hotmail.com", "live.com", "msn.com", "outlook.fr", "hotmail.fr", "live.fr"].includes(domain))
    return PRESETS.outlook;
  return undefined;
}
