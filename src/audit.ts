import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { dataPath } from "./config.js";

export interface AuditEntry {
  at: string;
  tool: string;
  accounts?: string[];
  summary: string;
}

/** Journal local des actions d'écriture. Jamais de contenu de mail ni de secret. */
export function audit(tool: string, summary: string, accounts?: string[]): void {
  const entry: AuditEntry = { at: new Date().toISOString(), tool, accounts, summary };
  appendFileSync(dataPath("audit.log"), `${JSON.stringify(entry)}\n`, { mode: 0o600 });
}

export function readAudit(limit = 50): AuditEntry[] {
  const file = dataPath("audit.log");
  if (!existsSync(file)) return [];
  return readFileSync(file, "utf8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .slice(-limit)
    .map((l) => JSON.parse(l) as AuditEntry)
    .reverse();
}
