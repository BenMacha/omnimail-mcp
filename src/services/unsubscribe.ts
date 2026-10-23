import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import type { Account } from "../accounts.js";
import { sendSimple } from "../smtp.js";

/** Refuse les adresses internes (protection SSRF). */
export function isPrivateAddress(ip: string): boolean {
  if (isIP(ip) === 6) {
    const v = ip.toLowerCase();
    if (v.startsWith("::ffff:")) return isPrivateAddress(v.slice(7));
    return v === "::1" || v === "::" || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe80");
  }
  const [a, b] = ip.split(".").map(Number);
  return (
    a === 10 ||
    a === 127 ||
    a === 0 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127)
  );
}

async function assertPublicUrl(url: string): Promise<URL> {
  const u = new URL(url);
  if (u.protocol !== "https:") throw new Error("Seuls les liens https sont appelés automatiquement.");
  if (process.env.OMNIMAIL_ALLOW_PRIVATE_URLS === "true") return u;
  const addresses = await lookup(u.hostname, { all: true });
  if (addresses.some((a) => isPrivateAddress(a.address))) {
    throw new Error(`Lien refusé : ${u.hostname} pointe vers une adresse interne.`);
  }
  return u;
}

/** RFC 8058 : POST "List-Unsubscribe=One-Click", sans cookie ni authentification. */
export async function oneClickUnsubscribe(url: string): Promise<{ status: number }> {
  const u = await assertPublicUrl(url);
  const res = await fetch(u, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "omnimail-mcp (RFC 8058)" },
    body: "List-Unsubscribe=One-Click",
    redirect: "manual",
    signal: AbortSignal.timeout(15_000),
  });
  if (res.status >= 400) throw new Error(`Le serveur de désabonnement a répondu ${res.status}.`);
  return { status: res.status };
}

export function parseMailto(uri: string): { to: string; subject: string; text: string } {
  const u = new URL(uri);
  const to = decodeURIComponent(u.pathname);
  return {
    to,
    subject: u.searchParams.get("subject") ?? "unsubscribe",
    text: u.searchParams.get("body") ?? "unsubscribe",
  };
}

export async function mailtoUnsubscribe(account: Account, uri: string): Promise<{ to: string }> {
  const mail = parseMailto(uri);
  await sendSimple(account, mail);
  return { to: mail.to };
}
