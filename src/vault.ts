import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";
import { existsSync, readFileSync, writeFileSync, renameSync, chmodSync } from "node:fs";
import { dataPath } from "./config.js";

/**
 * Coffre local chiffré (AES-256-GCM, clé dérivée par scrypt).
 *
 * Origine de la clé maître, par ordre de priorité :
 *  1. variable OMNIMAIL_MASTER_KEY ;
 *  2. fichier désigné par OMNIMAIL_MASTER_KEY_FILE ;
 *  3. secret Docker /run/secrets/omnimail_master_key ;
 *  4. fichier master.key généré dans le dossier de données (avec avertissement).
 */
interface VaultFile {
  v: 1;
  salt: string;
  iv: string;
  tag: string;
  data: string;
}

function readKeyMaterial(): string {
  if (process.env.OMNIMAIL_MASTER_KEY) return process.env.OMNIMAIL_MASTER_KEY;
  const candidates = [process.env.OMNIMAIL_MASTER_KEY_FILE, "/run/secrets/omnimail_master_key"];
  for (const file of candidates) {
    if (file && existsSync(file)) return readFileSync(file, "utf8").trim();
  }
  const local = dataPath("master.key");
  if (!existsSync(local)) {
    writeFileSync(local, randomBytes(32).toString("base64"), { mode: 0o600 });
    process.stderr.write(
      `[omnimail] Clé maître générée dans ${local}. Pour plus de sécurité, déplacez-la hors du volume de données ` +
        `(OMNIMAIL_MASTER_KEY_FILE ou secret Docker).\n`,
    );
  }
  return readFileSync(local, "utf8").trim();
}

function deriveKey(material: string, salt: Buffer): Buffer {
  return scryptSync(material, salt, 32, { N: 1 << 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
}

export class Vault<T> {
  constructor(
    private readonly file: string = dataPath("vault.enc"),
    private readonly material: () => string = readKeyMaterial,
  ) {}

  read(fallback: T): T {
    if (!existsSync(this.file)) return fallback;
    const raw = JSON.parse(readFileSync(this.file, "utf8")) as VaultFile;
    const key = deriveKey(this.material(), Buffer.from(raw.salt, "base64"));
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(raw.iv, "base64"));
    decipher.setAuthTag(Buffer.from(raw.tag, "base64"));
    try {
      const clear = Buffer.concat([decipher.update(Buffer.from(raw.data, "base64")), decipher.final()]);
      return JSON.parse(clear.toString("utf8")) as T;
    } catch {
      throw new Error("Impossible de déchiffrer le coffre : clé maître incorrecte ou fichier altéré.");
    }
  }

  write(value: T): void {
    const salt = randomBytes(16);
    const iv = randomBytes(12);
    const key = deriveKey(this.material(), salt);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    const data = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
    const out: VaultFile = {
      v: 1,
      salt: salt.toString("base64"),
      iv: iv.toString("base64"),
      tag: cipher.getAuthTag().toString("base64"),
      data: data.toString("base64"),
    };
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, JSON.stringify(out), { mode: 0o600 });
    renameSync(tmp, this.file);
    chmodSync(this.file, 0o600);
  }
}
