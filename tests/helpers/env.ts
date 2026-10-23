import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** Dossier de données isolé et clé maître de test, à appeler avant tout usage du coffre. */
export function isolatedDataDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "omnimail-unit-"));
  process.env.OMNIMAIL_DATA_DIR = dir;
  process.env.OMNIMAIL_MASTER_KEY = "cle-de-test";
  delete process.env.OMNIMAIL_SEND_ENABLED;
  return dir;
}

export const testAccount = {
  provider: "generic",
  address: "moi@example.com",
  username: "moi",
  secret: "mot-de-passe-app",
  imap: { host: "imap.example.com", port: 993, secure: true },
  smtp: { host: "smtp.example.com", port: 465, secure: true },
};
