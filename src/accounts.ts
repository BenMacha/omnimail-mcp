import { PRESETS, type ServerEndpoint } from "./presets.js";
import { Vault } from "./vault.js";

export interface Account {
  id: string;
  provider: string;
  address: string;
  displayName?: string;
  username: string;
  secret: string;
  imap: ServerEndpoint;
  smtp: ServerEndpoint;
  tlsInsecure?: boolean;
  createdAt: string;
}

/** Public view of an account: never any secret. */
export type PublicAccount = Omit<Account, "secret" | "username">;

interface VaultContent {
  accounts: Account[];
}

export class AccountStore {
  constructor(private readonly vault = new Vault<VaultContent>()) {}

  list(): Account[] {
    return this.vault.read({ accounts: [] }).accounts;
  }

  get(id: string): Account {
    const account = this.list().find((a) => a.id === id || a.address === id);
    if (!account) throw new Error(`Unknown account: ${id}`);
    return account;
  }

  resolve(ids?: string[] | "all"): Account[] {
    const all = this.list();
    if (!ids || ids === "all" || ids.length === 0) return all;
    return ids.map((id) => this.get(id));
  }

  add(input: Omit<Account, "id" | "createdAt"> & { id?: string }): Account {
    const accounts = this.list();
    const id = input.id ?? slug(input.address);
    if (accounts.some((a) => a.id === id)) throw new Error(`Account ${id} already exists.`);
    const account: Account = { ...input, id, createdAt: new Date().toISOString() };
    this.vault.write({ accounts: [...accounts, account] });
    return account;
  }

  remove(id: string): void {
    const target = this.get(id);
    this.vault.write({ accounts: this.list().filter((a) => a.id !== target.id) });
  }

  static toPublic(a: Account): PublicAccount {
    const { secret: _s, username: _u, ...rest } = a;
    return { ...rest, provider: PRESETS[a.provider]?.label ?? a.provider };
  }
}

export function slug(address: string): string {
  return address
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
