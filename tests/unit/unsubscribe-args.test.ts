import { afterEach, describe, expect, it, vi } from "vitest";

const dns = vi.hoisted(() => ({ lookup: vi.fn() }));
vi.mock("node:dns/promises", () => ({ lookup: dns.lookup }));

const smtp = vi.hoisted(() => ({ sendSimple: vi.fn() }));
vi.mock("../../src/smtp.js", () => ({ sendSimple: smtp.sendSimple }));

const { isPrivateAddress, mailtoUnsubscribe, oneClickUnsubscribe, parseMailto } = await import("../../src/services/unsubscribe.js");
const { flag, has, parseSettingValue } = await import("../../src/args.js");
const { loadSettings } = await import("../../src/config.js");
const { errorMessage } = await import("../../src/imap.js");

afterEach(() => {
  vi.unstubAllGlobals();
  dns.lookup.mockReset();
  smtp.sendSimple.mockReset();
  delete process.env.OMNIMAIL_ALLOW_PRIVATE_URLS;
});

describe("SSRF guard", () => {
  it.each([
    "127.0.0.1",
    "10.1.2.3",
    "192.168.1.1",
    "172.20.0.1",
    "169.254.169.254",
    "100.64.0.1",
    "0.0.0.0",
    "::1",
    "fd00::1",
    "fe80::1",
    "::ffff:10.0.0.1",
  ])("blocks %s", (ip) => expect(isPrivateAddress(ip)).toBe(true));

  it.each(["93.184.216.34", "172.32.0.1", "2606:4700::1111"])("allows %s", (ip) => expect(isPrivateAddress(ip)).toBe(false));
});

describe("one-click unsubscribe", () => {
  it("POSTs the RFC 8058 body without following redirects", async () => {
    dns.lookup.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
    const fetchMock = vi.fn().mockResolvedValue({ status: 202 });
    vi.stubGlobal("fetch", fetchMock);
    expect(await oneClickUnsubscribe("https://news.example/u/1")).toEqual({ status: 202 });
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe("https://news.example/u/1");
    expect(init).toMatchObject({ method: "POST", body: "List-Unsubscribe=One-Click", redirect: "manual" });
    expect(init.headers["Content-Type"]).toBe("application/x-www-form-urlencoded");
    expect(init.headers).not.toHaveProperty("Cookie");
  });

  it("refuses http links", async () => {
    await expect(oneClickUnsubscribe("http://news.example/u")).rejects.toThrow(/Only https/);
  });

  it("refuses hosts resolving to internal addresses", async () => {
    dns.lookup.mockResolvedValue([
      { address: "93.184.216.34", family: 4 },
      { address: "10.0.0.5", family: 4 },
    ]);
    vi.stubGlobal("fetch", vi.fn());
    await expect(oneClickUnsubscribe("https://evil.example/u")).rejects.toThrow(/internal address/);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("can allow private URLs explicitly (tests, intranet)", async () => {
    process.env.OMNIMAIL_ALLOW_PRIVATE_URLS = "true";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ status: 200 }));
    await oneClickUnsubscribe("https://localhost/u");
    expect(dns.lookup).not.toHaveBeenCalled();
  });

  it("fails on HTTP errors", async () => {
    dns.lookup.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ status: 410 }));
    await expect(oneClickUnsubscribe("https://news.example/u")).rejects.toThrow(/410/);
  });
});

describe("mailto unsubscribe", () => {
  it("parses subject and body", () => {
    expect(parseMailto("mailto:unsub@x.example?subject=stop&body=please")).toEqual({
      to: "unsub@x.example",
      subject: "stop",
      text: "please",
    });
    expect(parseMailto("mailto:u%2Bnews@x.example")).toEqual({ to: "u+news@x.example", subject: "unsubscribe", text: "unsubscribe" });
  });

  it("sends the request from the account", async () => {
    smtp.sendSimple.mockResolvedValue({});
    const res = await mailtoUnsubscribe({} as never, "mailto:u@x.example?subject=unsubscribe");
    expect(res).toEqual({ to: "u@x.example" });
    expect(smtp.sendSimple).toHaveBeenCalledWith({}, { to: "u@x.example", subject: "unsubscribe", text: "unsubscribe" });
  });
});

describe("CLI arguments", () => {
  const args = ["--address", "me@x.example", "--imap-starttls", "--port", "4000"];

  it("reads flags and switches", () => {
    expect(flag(args, "address")).toBe("me@x.example");
    expect(flag(args, "missing")).toBeUndefined();
    expect(has(args, "imap-starttls")).toBe(true);
    expect(has(args, "http")).toBe(false);
  });

  it("types setting values", () => {
    const s = loadSettings();
    expect(parseSettingValue(s, "sendEnabled", "true")).toEqual({ sendEnabled: true });
    expect(parseSettingValue(s, "maxActionsPerPlan", "100")).toEqual({ maxActionsPerPlan: 100 });
    expect(parseSettingValue(s, "language", "ar")).toEqual({ language: "ar" });
    expect(parseSettingValue(s, "classifyRoot", "Mine")).toEqual({ classifyRoot: "Mine" });
    expect(() => parseSettingValue(s, "sendEnabled", "yes")).toThrow(/true or false/);
    expect(() => parseSettingValue(s, "planTtlMinutes", "-1")).toThrow(/positive/);
    expect(() => parseSettingValue(s, "language", "de")).toThrow(/en, fr or ar/);
    expect(() => parseSettingValue(s, "nope", "1")).toThrow(/Unknown setting/);
  });
});

describe("IMAP error messages", () => {
  it("explains authentication failures and server responses", () => {
    expect(errorMessage({ authenticationFailed: true })).toMatch(/Authentication refused/);
    expect(errorMessage({ responseText: "Mailbox is full" })).toBe("Mailbox is full");
    expect(errorMessage(new Error("timeout"))).toBe("timeout");
    expect(errorMessage("raw")).toBe("raw");
  });
});
