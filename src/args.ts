import type { Settings } from "./config.js";

/** Value following `--name`, if any. */
export function flag(args: string[], name: string): string | undefined {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
}

export function has(args: string[], name: string): boolean {
  return args.includes(`--${name}`);
}

/** Converts a CLI string to the type of the existing setting. */
export function parseSettingValue(current: Settings, key: string, value: string | undefined): Partial<Settings> {
  if (!(key in current)) throw new Error(`Unknown setting. Settings: ${Object.keys(current).join(", ")}`);
  const existing = current[key as keyof Settings];
  if (typeof existing === "boolean") {
    if (value !== "true" && value !== "false") throw new Error(`${key} expects true or false.`);
    return { [key]: value === "true" } as Partial<Settings>;
  }
  if (typeof existing === "number") {
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0) throw new Error(`${key} expects a positive number.`);
    return { [key]: n } as Partial<Settings>;
  }
  if (key === "language" && !["en", "fr", "ar"].includes(value ?? "")) throw new Error("language expects en, fr or ar.");
  return { [key]: value ?? "" } as Partial<Settings>;
}
