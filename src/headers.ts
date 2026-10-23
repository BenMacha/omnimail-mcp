/** Raw header parsing (RFC 5322) and list headers (RFC 2369, RFC 8058). */

export type HeaderMap = Map<string, string[]>;

export function parseHeaders(raw: Buffer | string | undefined): HeaderMap {
  const map: HeaderMap = new Map();
  if (!raw) return map;
  const text = raw.toString().replace(/\r\n/g, "\n");
  const unfolded = text.replace(/\n[ \t]+/g, " ");
  for (const line of unfolded.split("\n")) {
    const idx = line.indexOf(":");
    if (idx <= 0) continue;
    const name = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();
    map.set(name, [...(map.get(name) ?? []), value]);
  }
  return map;
}

export function header(map: HeaderMap, name: string): string | undefined {
  return map.get(name.toLowerCase())?.[0];
}

export interface UnsubscribeInfo {
  /** Advertised https (or http) links. */
  http: string[];
  /** Advertised mailto addresses (with optional subject / body). */
  mailto: string[];
  /** RFC 8058: a POST "List-Unsubscribe=One-Click" is enough. */
  oneClick: boolean;
}

export function parseListUnsubscribe(value?: string, post?: string): UnsubscribeInfo {
  const info: UnsubscribeInfo = { http: [], mailto: [], oneClick: false };
  if (!value) return info;
  for (const m of value.matchAll(/<([^>]+)>/g)) {
    const uri = m[1].trim();
    if (/^https?:/i.test(uri)) info.http.push(uri);
    else if (/^mailto:/i.test(uri)) info.mailto.push(uri);
  }
  info.oneClick = Boolean(post && /List-Unsubscribe=One-Click/i.test(post) && info.http.some((u) => u.startsWith("https:")));
  return info;
}

/** Extracts the e-mail address from a "Name <address>" value. */
export function extractAddress(value?: string): string | undefined {
  if (!value) return undefined;
  const m = value.match(/<([^>]+)>/) ?? value.match(/([^\s<>"]+@[^\s<>"]+)/);
  return m?.[1]?.toLowerCase();
}

export function domainOf(address?: string): string | undefined {
  return address?.split("@")[1]?.toLowerCase();
}

/** Approximate organizational domain: last two labels (three for co.uk, com.tn…). */
export function baseDomain(domain?: string): string | undefined {
  if (!domain) return undefined;
  const parts = domain.split(".");
  const twoLevelTld = /^(co|com|org|net|gov|ac|gouv)$/.test(parts[parts.length - 2] ?? "") && parts.length > 2;
  return parts.slice(twoLevelTld ? -3 : -2).join(".");
}
