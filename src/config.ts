import { accessSync, constants, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export type Language = "en" | "fr" | "ar";

export interface Settings {
  /** Allow sending mail (off by default). */
  sendEnabled: boolean;
  /** Maximum number of messages a single plan may touch. */
  maxActionsPerPlan: number;
  /** How long a plan stays valid before confirmation, in minutes. */
  planTtlMinutes: number;
  /** Maximum search results per account and folder. */
  searchLimitPerAccount: number;
  /** Language used for the folders omnimail creates. */
  language: Language;
  /** Root folder for sorting; empty = localized default ("Sorted", "Classement", "مرتب"). */
  classifyRoot: string;
}

const DEFAULT_SETTINGS: Settings = {
  sendEnabled: false,
  maxActionsPerPlan: 5000,
  planTtlMinutes: 15,
  searchLimitPerAccount: 50,
  language: "en",
  classifyRoot: "",
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
  const dir = process.env.OMNIMAIL_DATA_DIR ?? (existsSync("/data") && isWritable("/data") ? "/data" : join(homedir(), ".omnimail"));
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
  const lang = process.env.OMNIMAIL_LANGUAGE;
  if (lang === "en" || lang === "fr" || lang === "ar") settings.language = lang;
  return settings;
}

export function saveSettings(patch: Partial<Settings>): Settings {
  const next = { ...loadSettings(), ...patch };
  writeFileSync(dataPath("settings.json"), JSON.stringify(next, null, 2), { mode: 0o600 });
  return next;
}
