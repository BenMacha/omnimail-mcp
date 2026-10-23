/**
 * Faux client IMAP en mémoire, compatible avec le sous-ensemble d'ImapFlow utilisé par omnimail.
 * Permet de tester les services sans serveur.
 */

export interface FakeMessage {
  uid: number;
  flags: Set<string>;
  date: Date;
  from: { name?: string; address: string };
  to?: string[];
  subject: string;
  messageId: string;
  headers: Record<string, string>;
  source?: string;
}

interface Folder {
  uidNext: number;
  specialUse?: string;
  messages: Map<number, FakeMessage>;
}

export interface SeedMessage {
  from: string;
  name?: string;
  subject: string;
  seen?: boolean;
  date?: Date;
  headers?: Record<string, string>;
  source?: string;
}

let counter = 0;

export class FakeImap {
  folders = new Map<string, Folder>();
  selected?: string;
  failMoveTo?: string;
  noUidPlus = false;
  calls: string[] = [];

  constructor(
    readonly delimiter = "/",
    specials: Record<string, string> = {},
  ) {
    this.folders.set("INBOX", { uidNext: 1, messages: new Map() });
    for (const [path, use] of Object.entries(specials)) this.folders.set(path, { uidNext: 1, specialUse: use, messages: new Map() });
  }

  seed(folder: string, m: SeedMessage): FakeMessage {
    const f = this.folders.get(folder);
    if (!f) throw new Error(`dossier ${folder} absent`);
    const msg: FakeMessage = {
      uid: f.uidNext++,
      flags: new Set(m.seen ? ["\\Seen"] : []),
      date: m.date ?? new Date(),
      from: { name: m.name, address: m.from },
      to: ["moi@example.com"],
      subject: m.subject,
      messageId: `<m${++counter}@test>`,
      headers: m.headers ?? {},
      source: m.source,
    };
    f.messages.set(msg.uid, msg);
    return msg;
  }

  count(path: string): number | undefined {
    return this.folders.get(path)?.messages.size;
  }

  private folder(path: string): Folder {
    const f = this.folders.get(path);
    if (!f) throw Object.assign(new Error(`Mailbox doesn't exist: ${path}`), { responseText: `Mailbox doesn't exist: ${path}` });
    return f;
  }

  private current(): Folder {
    if (!this.selected) throw new Error("aucun dossier sélectionné");
    return this.folder(this.selected);
  }

  async list(_opts?: unknown) {
    return [...this.folders.entries()].map(([path, f]) => {
      const parts = path.split(this.delimiter);
      return {
        path,
        name: parts[parts.length - 1],
        delimiter: this.delimiter,
        parentPath: parts.slice(0, -1).join(this.delimiter),
        flags: new Set<string>(),
        specialUse: f.specialUse ?? (path === "INBOX" ? "\\Inbox" : undefined),
        status: { messages: f.messages.size, unseen: [...f.messages.values()].filter((m) => !m.flags.has("\\Seen")).length },
      };
    });
  }

  async status(path: string, _q: unknown) {
    const f = this.folder(path);
    return { path, messages: f.messages.size, unseen: [...f.messages.values()].filter((m) => !m.flags.has("\\Seen")).length };
  }

  async mailboxCreate(path: string) {
    this.calls.push(`create ${path}`);
    if (this.folders.has(path)) return { path, created: false };
    this.folders.set(path, { uidNext: 1, messages: new Map() });
    return { path, created: true };
  }

  async mailboxDelete(path: string) {
    this.calls.push(`delete ${path}`);
    this.folders.delete(path);
    return { path };
  }

  async getMailboxLock(path: string) {
    this.folder(path);
    this.selected = path;
    return { path, release: () => (this.selected = undefined) };
  }

  async search(q: Record<string, unknown>, _o?: unknown): Promise<number[]> {
    return [...this.current().messages.values()]
      .filter((m) => {
        if (q.seen !== undefined && m.flags.has("\\Seen") !== q.seen) return false;
        if (q.flagged !== undefined && m.flags.has("\\Flagged") !== q.flagged) return false;
        if (q.since && m.date < (q.since as Date)) return false;
        if (q.before && m.date >= (q.before as Date)) return false;
        if (q.from && !m.from.address.includes(String(q.from))) return false;
        if (q.subject && !m.subject.toLowerCase().includes(String(q.subject).toLowerCase())) return false;
        if (q.text && !`${m.subject} ${m.from.address}`.toLowerCase().includes(String(q.text).toLowerCase())) return false;
        if (q.larger && (m.source?.length ?? 1000) <= (q.larger as number)) return false;
        const h = q.header as Record<string, string> | undefined;
        if (h?.["message-id"] && m.messageId !== h["message-id"]) return false;
        return true;
      })
      .map((m) => m.uid);
  }

  async *fetch(uids: number[], _q: unknown, _o?: unknown) {
    const f = this.current();
    for (const uid of uids) {
      const m = f.messages.get(uid);
      if (!m) continue;
      const headers = Object.entries({ "message-id": m.messageId, ...m.headers })
        .map(([k, v]) => `${k}: ${v}`)
        .join("\r\n");
      yield {
        uid,
        seq: uid,
        flags: m.flags,
        size: m.source?.length ?? 1000,
        headers: Buffer.from(`${headers}\r\n`),
        envelope: {
          date: m.date,
          subject: m.subject,
          messageId: m.messageId,
          from: [m.from],
          to: (m.to ?? []).map((address) => ({ address })),
        },
      };
    }
  }

  async fetchOne(uid: string, _q: unknown, _o?: unknown) {
    const m = this.current().messages.get(Number(uid));
    if (!m) return false;
    const source =
      m.source ??
      [
        `From: ${m.from.name ? `"${m.from.name}" ` : ""}<${m.from.address}>`,
        "To: moi@example.com",
        `Subject: ${m.subject}`,
        `Message-ID: ${m.messageId}`,
        "",
        "Corps",
      ].join("\r\n");
    return { uid: m.uid, seq: m.uid, source: Buffer.from(source) };
  }

  async messageMove(uids: number[], dest: string, _o?: unknown) {
    this.calls.push(`move ${uids.join(",")} -> ${dest}`);
    if (this.failMoveTo === dest) throw Object.assign(new Error("NO"), { responseText: "Move refused" });
    const src = this.current();
    const target = this.folder(dest);
    const uidMap = new Map<number, number>();
    for (const uid of uids) {
      const m = src.messages.get(uid);
      if (!m) continue;
      src.messages.delete(uid);
      const newUid = target.uidNext++;
      target.messages.set(newUid, { ...m, uid: newUid });
      uidMap.set(uid, newUid);
    }
    return { path: this.selected!, destination: dest, uidMap: this.noUidPlus ? undefined : uidMap };
  }

  async messageFlagsAdd(uids: number[], flags: string[]) {
    for (const uid of uids) for (const fl of flags) this.current().messages.get(uid)?.flags.add(fl);
    return true;
  }

  async messageFlagsRemove(uids: number[], flags: string[]) {
    for (const uid of uids) for (const fl of flags) this.current().messages.get(uid)?.flags.delete(fl);
    return true;
  }

  async messageDelete(uid: string, _o?: unknown) {
    this.current().messages.delete(Number(uid));
    return true;
  }

  async append(path: string, content: Buffer | string, flags: string[] = []) {
    const f = this.folder(path);
    const raw = content.toString();
    const subject = raw.match(/^Subject: (.*)$/m)?.[1] ?? "";
    const msg: FakeMessage = {
      uid: f.uidNext++,
      flags: new Set(flags),
      date: new Date(),
      from: { address: raw.match(/^From: .*?<?([^\s<>]+@[^\s<>]+)>?$/m)?.[1] ?? "" },
      subject,
      messageId: raw.match(/^Message-ID: (.*)$/im)?.[1] ?? `<a${++counter}@test>`,
      headers: {},
      source: raw,
    };
    f.messages.set(msg.uid, msg);
    return { destination: path, uid: msg.uid };
  }
}
