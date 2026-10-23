import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { AccountStore, slug } from "../../src/accounts.js";
import { audit, readAudit } from "../../src/audit.js";
import { dataDir, loadSettings, saveSettings } from "../../src/config.js";
import { PRESETS, presetForAddress } from "../../src/presets.js";
import { isolatedDataDir, testAccount } from "../helpers/env.js";

let dir: string;
beforeEach(() => {
  dir = isolatedDataDir();
});

describe("réglages", () => {
  it("utilise OMNIMAIL_DATA_DIR", () => {
    expect(dataDir()).toBe(dir);
  });

  it("fournit des valeurs par défaut prudentes", () => {
    expect(loadSettings()).toMatchObject({
      sendEnabled: false,
      maxActionsPerPlan: 5000,
      planTtlMinutes: 15,
      language: "en",
      classifyRoot: "",
    });
  });

  it("enregistre un réglage avec des droits restreints", () => {
    saveSettings({ classifyRoot: "Mine" });
    expect(loadSettings().classifyRoot).toBe("Mine");
    expect(statSync(join(dir, "settings.json")).mode & 0o777).toBe(0o600);
  });

  it("laisse la variable d'environnement primer pour l'envoi", () => {
    saveSettings({ sendEnabled: true });
    process.env.OMNIMAIL_SEND_ENABLED = "false";
    expect(loadSettings().sendEnabled).toBe(false);
  });
});

describe("comptes", () => {
  it("ajoute, retrouve par id ou adresse, puis supprime", () => {
    const store = new AccountStore();
    const a = store.add(testAccount);
    expect(a.id).toBe("moi-example-com");
    expect(store.get("moi@example.com").id).toBe(a.id);
    expect(store.resolve()).toHaveLength(1);
    expect(store.resolve("all")).toHaveLength(1);
    expect(store.resolve(["moi-example-com"])[0].address).toBe("moi@example.com");
    store.remove(a.id);
    expect(store.list()).toEqual([]);
    expect(() => store.get(a.id)).toThrow(/Unknown/);
  });

  it("refuse les doublons", () => {
    const store = new AccountStore();
    store.add(testAccount);
    expect(() => store.add(testAccount)).toThrow(/already exists/);
  });

  it("ne stocke jamais le secret en clair", () => {
    new AccountStore().add(testAccount);
    const raw = readFileSync(join(dir, "vault.enc"), "utf8");
    expect(raw).not.toContain("mot-de-passe-app");
    expect(raw).not.toContain("moi@example.com");
    expect(statSync(join(dir, "vault.enc")).mode & 0o777).toBe(0o600);
  });

  it("expose une vue publique sans secret ni identifiant", () => {
    const pub = AccountStore.toPublic({ ...testAccount, id: "x", createdAt: "", provider: "icloud" });
    expect(pub).not.toHaveProperty("secret");
    expect(pub).not.toHaveProperty("username");
    expect(pub.provider).toBe("iCloud Mail");
  });

  it("génère des identifiants lisibles", () => {
    expect(slug("Jean.Dupont+news@Mail.Example.fr")).toBe("jean-dupont-news-mail-example-fr");
  });
});

describe("fournisseurs", () => {
  it.each([
    ["moi@icloud.com", "icloud"],
    ["moi@me.com", "icloud"],
    ["moi@gmail.com", "gmail"],
    ["moi@yahoo.fr", "yahoo"],
    ["moi@aol.com", "aol"],
    ["moi@ik.me", "infomaniak"],
    ["moi@proton.me", "proton"],
    ["moi@pm.me", "proton"],
    ["moi@fastmail.com", "fastmail"],
    ["moi@gmx.fr", "gmx"],
    ["moi@hotmail.fr", "outlook"],
  ])("%s → %s", (address, id) => {
    expect(presetForAddress(address)?.id).toBe(id);
  });

  it("ne devine pas les domaines inconnus", () => {
    expect(presetForAddress("moi@entreprise.tn")).toBeUndefined();
  });

  it("décrit chaque fournisseur de façon cohérente", () => {
    for (const p of Object.values(PRESETS)) {
      expect(p.imap.port).toBeGreaterThan(0);
      expect(p.smtp.port).toBeGreaterThan(0);
      if (p.imap.port === 993) expect(p.imap.secure).toBe(true);
      if (p.smtp.port === 587) expect(p.smtp.secure).toBe(false);
    }
    expect(PRESETS.outlook.oauthOnly).toBe(true);
    expect(PRESETS.proton.tlsInsecure).toBe(true);
  });
});

describe("journal", () => {
  it("ajoute des entrées et les relit de la plus récente à la plus ancienne", () => {
    expect(readAudit()).toEqual([]);
    audit("mail_move", "3 mails", ["a"]);
    audit("plan_apply", "plan x");
    const entries = readAudit(10);
    expect(entries.map((e) => e.tool)).toEqual(["plan_apply", "mail_move"]);
    expect(readAudit(1)).toHaveLength(1);
    expect(existsSync(join(dir, "audit.log"))).toBe(true);
  });
});
