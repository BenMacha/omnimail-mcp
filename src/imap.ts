import { ImapFlow, type ListResponse } from "imapflow";
import type { Account } from "./accounts.js";
import { PRESETS } from "./presets.js";

export function isGmail(account: Account): boolean {
  return Boolean(PRESETS[account.provider]?.gmail) || account.imap.host === "imap.gmail.com";
}

export function createClient(account: Account): ImapFlow {
  return new ImapFlow({
    host: account.imap.host,
    port: account.imap.port,
    secure: account.imap.secure,
    auth: { user: account.username, pass: account.secret },
    logger: false,
    tls: account.tlsInsecure ? { rejectUnauthorized: false } : undefined,
    connectionTimeout: 20_000,
  });
}

/** Opens an IMAP connection, runs fn, then logs out cleanly. */
export async function withImap<T>(account: Account, fn: (client: ImapFlow) => Promise<T>): Promise<T> {
  const client = createClient(account);
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.logout().catch(() => client.close());
  }
}

/** Runs fn with the mailbox selected and locked. */
export async function inMailbox<T>(client: ImapFlow, path: string, fn: () => Promise<T>): Promise<T> {
  const lock = await client.getMailboxLock(path);
  try {
    return await fn();
  } finally {
    lock.release();
  }
}

export async function findSpecialUse(client: ImapFlow, use: string, folders?: ListResponse[]): Promise<string | undefined> {
  const list = folders ?? (await client.list());
  return list.find((f) => f.specialUse === use)?.path;
}

/** Creates a folder (and its parents) from segments, using the server's delimiter. */
export async function ensureFolder(client: ImapFlow, segments: string[]): Promise<string> {
  const folders = await client.list();
  const delimiter = folders.find((f) => f.delimiter)?.delimiter ?? "/";
  let path = "";
  for (const segment of segments) {
    path = path ? `${path}${delimiter}${segment}` : segment;
    if (!folders.some((f) => f.path === path)) {
      await client.mailboxCreate(path);
    }
  }
  return path;
}

export function errorMessage(err: unknown): string {
  if (err && typeof err === "object") {
    const e = err as { responseText?: string; message?: string; authenticationFailed?: boolean };
    if (e.authenticationFailed) return "Authentication refused (app password revoked or wrong).";
    return e.responseText ?? e.message ?? String(err);
  }
  return String(err);
}
