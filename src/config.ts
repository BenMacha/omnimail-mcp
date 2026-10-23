import { existsSync, mkdirSync, readFileSync, writeFileSync, accessSync, constants } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export interface Settings {
  /** Envoi de mails autorisé (désactivé par défaut). */
  sendEnabled: boolean;
  /** Nombre maximal de mails touchés par un plan. */
  maxActionsPerPlan: number;
  /** Durée de validité d'un plan avant confirmation, en minutes. */
  planTtlMinutes: number;
  /** Nombre maximal de résultats par compte pour une recherche. */
  searchLimitPerAccount: number;
  /** Racine des dossiers créés par le classement. */
  classifyRoot: string;
}

const DEFAULT_SETTINGS: Settings = {
  sendEnabled: false,
  maxActionsPerPlan: 5000,
  planTtlMinutes: 15,
  searchLimitPerAccount: 50,
  classifyRoot: "Classement",
};

function isWritable(dir: string): boolean {
  try {
    accessSync(dir, constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

export function dataDir(): string {
  const dir =
    process.env.OMNIMAIL_DATA_DIR ??
    (existsSync("/data") && isWritable("/data") ? "/data" : join(homedir(), ".omnimail"));
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true, mode: 0o700 });
  return dir;
}

export function dataPath(name: string): string {
  return join(dataDir(), name);
}

export function loadSettings(): Settings {
  const file = dataPath("settings.json");
  let settings = { ...DEFAULT_SETTINGS };
  if (existsSync(file)) {
    settings = { ...settings, ...JSON.parse(readFileSync(file, "utf8")) };
  }
  if (process.env.OMNIMAIL_SEND_ENABLED !== undefined) {
    settings.sendEnabled = process.env.OMNIMAIL_SEND_ENABLED === "true";
  }
  return settings;
}

export function saveSettings(patch: Partial<Settings>): Settings {
  const next = { ...loadSettings(), ...patch };
  writeFileSync(dataPath("settings.json"), JSON.stringify(next, null, 2), { mode: 0o600 });
  return next;
}
