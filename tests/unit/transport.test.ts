import { existsSync, mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isolatedDataDir, testAccount } from "../helpers/env.js";
import { FakeImap } from "../helpers/fake-imap.js";

const imapflow = vi.hoisted(() => ({
  instances: [] as { opts: Record<string, unknown>; logout: ReturnType<typeof vi.fn>; close: ReturnType<typeof vi.fn> }[],
}));
vi.mock("imapflow", () => ({
  ImapFlow: class {
    opts: Record<string, unknown>;
    connect = vi.fn().mockResolvedValue(undefined);
    logout = vi.fn().mockResolvedValue(undefined);
    close = vi.fn();
    constructor(opts: Record<string, unknown>) {
      this.opts = opts;
      imapflow.instances.push(this);
    }
  },
}));

const mailer = vi.hoisted(() => ({ sendMail: vi.fn(), close: vi.fn(), options: [] as unknown[] }));
vi.mock("nodemailer", () => ({
  default: {
    createTransport: (opts: unknown) => {
      mailer.options.push(opts);
      return { sendMail: mailer.sendMail, close: mailer.close };
    },
  },
}));

const { createClient, ensureFolder, findSpecialUse, isGmail, withImap } = await import("../../src/imap.js");
const { sendRaw, sendSimple } = await import("../../src/smtp.js");
const { Vault } = await import("../../src/vault.js");

const account = { ...testAccount, id: "me", createdAt: "" };

beforeEach(() => {
  isolatedDataDir();
  imapflow.instances.length = 0;
  mailer.options.length = 0;
  mailer.sendMail.mockReset().mockResolvedValue({ messageId: "<x>" });
  mailer.close.mockReset();
});

afterEach(() => {
  delete process.env.OMNIMAIL_MASTER_KEY_FILE;
});

describe("IMAP connections", () => {
  it("builds the client from the account", () => {
    createClient({ ...account, tlsInsecure: true });
    expect(imapflow.instances[0].opts).toMatchObject({
      host: "imap.example.com",
      port: 993,
      secure: true,
      auth: { user: "moi", pass: "mot-de-passe-app" },
      logger: false,
      tls: { rejectUnauthorized: false },
    });
  });

  it("always logs out, even when the callback fails", async () => {
    await expect(withImap(account, async () => Promise.reject(new Error("boom")))).rejects.toThrow("boom");
    expect(imapflow.instances[0].logout).toHaveBeenCalled();
    expect(await withImap(account, async () => 42)).toBe(42);
  });

  it("closes the socket when logout fails", async () => {
    await withImap(account, async (c) => {
      (c as unknown as { logout: ReturnType<typeof vi.fn> }).logout.mockRejectedValue(new Error("gone"));
    });
    expect(imapflow.instances[0].close).toHaveBeenCalled();
  });

  it("recognizes Gmail", () => {
    expect(isGmail({ ...account, provider: "gmail" })).toBe(true);
    expect(isGmail({ ...account, imap: { host: "imap.gmail.com", port: 993, secure: true } })).toBe(true);
    expect(isGmail(account)).toBe(false);
  });

  it("creates nested folders with the server delimiter", async () => {
    const fake = new FakeImap(".", { Trash: "\\Trash" });
    expect(await ensureFolder(fake as never, ["A", "B"])).toBe("A.B");
    expect(fake.calls).toEqual(["create A", "create A.B"]);
    expect(await ensureFolder(fake as never, ["A", "B"])).toBe("A.B");
    expect(fake.calls).toHaveLength(2);
    expect(await findSpecialUse(fake as never, "\\Trash")).toBe("Trash");
    expect(await findSpecialUse(fake as never, "\\Archive")).toBeUndefined();
  });
});

describe("SMTP", () => {
  it("sends raw messages with an explicit envelope and closes the transport", async () => {
    await sendRaw(account, { from: "moi@example.com", to: ["k@example.org"] }, "raw");
    expect(mailer.options[0]).toMatchObject({ host: "smtp.example.com", port: 465, secure: true, auth: { user: "moi" } });
    expect(mailer.sendMail).toHaveBeenCalledWith({ envelope: { from: "moi@example.com", to: ["k@example.org"] }, raw: "raw" });
    expect(mailer.close).toHaveBeenCalled();
  });

  it("closes the transport when sending fails", async () => {
    mailer.sendMail.mockRejectedValue(new Error("550"));
    await expect(sendSimple(account, { to: "u@x", subject: "unsubscribe", text: "unsubscribe" })).rejects.toThrow("550");
    expect(mailer.close).toHaveBeenCalled();
  });

  it("sends simple messages from the account address", async () => {
    await sendSimple({ ...account, tlsInsecure: true }, { to: "u@x", subject: "s", text: "t" });
    expect(mailer.sendMail).toHaveBeenCalledWith({ from: "moi@example.com", to: "u@x", subject: "s", text: "t" });
    expect(mailer.options[0]).toMatchObject({ tls: { rejectUnauthorized: false } });
  });
});

describe("vault key sources", () => {
  it("reads the key from OMNIMAIL_MASTER_KEY_FILE", () => {
    delete process.env.OMNIMAIL_MASTER_KEY;
    const keyFile = join(mkdtempSync(join(tmpdir(), "key-")), "k");
    writeFileSync(keyFile, "from-file\n");
    process.env.OMNIMAIL_MASTER_KEY_FILE = keyFile;
    const file = join(mkdtempSync(join(tmpdir(), "v-")), "v.enc");
    new Vault<{ a: number }>(file).write({ a: 1 });
    expect(new Vault<{ a: number }>(file, () => "from-file").read({ a: 0 })).toEqual({ a: 1 });
  });

  it("generates a private master.key when no key is configured", () => {
    const dir = isolatedDataDir();
    delete process.env.OMNIMAIL_MASTER_KEY;
    const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    new Vault<{ a: number }>().write({ a: 2 });
    expect(existsSync(join(dir, "master.key"))).toBe(true);
    expect(statSync(join(dir, "master.key")).mode & 0o777).toBe(0o600);
    expect(Buffer.from(readFileSync(join(dir, "master.key"), "utf8"), "base64")).toHaveLength(32);
    expect(stderr).toHaveBeenCalledWith(expect.stringMatching(/Master key generated/));
    expect(new Vault<{ a: number }>().read({ a: 0 })).toEqual({ a: 2 });
    stderr.mockRestore();
  });
});
