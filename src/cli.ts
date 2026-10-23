#!/usr/bin/env node
import { createServer as createHttpServer } from "node:http";
import { createInterface } from "node:readline";
import { timingSafeEqual } from "node:crypto";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { AccountStore } from "./accounts.js";
import { dataDir, loadSettings, saveSettings, type Settings } from "./config.js";
import { PRESETS, presetForAddress } from "./presets.js";
import { createServer, VERSION } from "./server.js";
import { accountHealth } from "./services/read.js";

const HELP = `omnimail ${VERSION} — serveur MCP multi-comptes mail

Usage :
  omnimail serve                       Serveur MCP en stdio (Claude Code, Claude Desktop…)
  omnimail serve --http [--port 3333] [--host 127.0.0.1]
                                       Serveur MCP HTTP (Streamable HTTP), jeton OMNIMAIL_HTTP_TOKEN obligatoire
  omnimail accounts add                Ajout interactif d'un compte
  omnimail accounts add --address A [--provider P] [--username U] [--name N]
        [--imap-host H --imap-port 993 --imap-starttls] [--smtp-host H --smtp-port 465 --smtp-starttls]
        --password-stdin               Ajout non interactif (mot de passe lu sur l'entrée standard)
  omnimail accounts list               Liste des comptes
  omnimail accounts test [id]          Teste la connexion
  omnimail accounts remove <id>        Supprime un compte et son secret
  omnimail providers                   Fournisseurs préconfigurés
  omnimail settings get
  omnimail settings set <clé> <valeur> ex. sendEnabled true

Données : ${"$"}OMNIMAIL_DATA_DIR, /data (Docker) ou ~/.omnimail`;

function flag(args: string[], name: string): string | undefined {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
}

function has(args: string[], name: string): boolean {
  return args.includes(`--${name}`);
}

function ask(question: string, hidden = false): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stderr, terminal: true });
    if (hidden) {
      const write = (rl as unknown as { _writeToOutput: (s: string) => void })._writeToOutput;
      (rl as unknown as { _writeToOutput: (s: string) => void })._writeToOutput = (s: string) => {
        if (s.startsWith(question)) write.call(rl, s);
        else if (s.includes("\n")) write.call(rl, "\n");
      };
    }
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const c of process.stdin) chunks.push(c as Buffer);
  return Buffer.concat(chunks).toString("utf8").trim();
}

async function addAccount(args: string[]) {
  const store = new AccountStore();
  const interactive = !has(args, "password-stdin");
  const address = flag(args, "address") ?? (interactive ? await ask("Adresse e-mail : ") : undefined);
  if (!address) throw new Error("--address est obligatoire.");
  const guessed = presetForAddress(address);
  let providerId = flag(args, "provider") ?? guessed?.id;
  if (!providerId && interactive && !flag(args, "imap-host")) {
    process.stderr.write(`Fournisseurs : ${Object.keys(PRESETS).join(", ")}, generic\n`);
    providerId = (await ask("Fournisseur : ")) || "generic";
  }
  providerId = providerId ?? "generic";
  const preset = PRESETS[providerId];
  if (preset?.oauthOnly) throw new Error(`${preset.label} : ${preset.note}`);

  let imap = preset?.imap;
  let smtp = preset?.smtp;
  const imapHost = flag(args, "imap-host") ?? (!preset && interactive ? await ask("Serveur IMAP : ") : undefined);
  if (imapHost) imap = { host: imapHost, port: Number(flag(args, "imap-port") ?? 993), secure: !has(args, "imap-starttls") };
  const smtpHost = flag(args, "smtp-host") ?? (!preset && interactive ? await ask("Serveur SMTP : ") : undefined);
  if (smtpHost) smtp = { host: smtpHost, port: Number(flag(args, "smtp-port") ?? 465), secure: !has(args, "smtp-starttls") };
  if (!imap || !smtp) throw new Error("Serveurs IMAP et SMTP inconnus : utilisez --provider ou --imap-host / --smtp-host.");

  if (interactive && preset) {
    process.stderr.write(`\n${preset.label}${preset.note ? ` — ${preset.note}` : ""}\n`);
    if (preset.appPasswordUrl) process.stderr.write(`Créez un mot de passe d'application ici : ${preset.appPasswordUrl}\n`);
    process.stderr.write("N'utilisez jamais le mot de passe principal du compte.\n\n");
  }
  const username = flag(args, "username") ?? address;
  const secret = interactive ? await ask("Mot de passe d'application (masqué) : ", true) : await readStdin();
  if (!secret) throw new Error("Mot de passe vide.");

  const draft = {
    id: flag(args, "id"),
    provider: providerId,
    address,
    displayName: flag(args, "name"),
    username,
    secret,
    imap,
    smtp,
    tlsInsecure: preset?.tlsInsecure,
  };
  process.stderr.write("Test de la connexion IMAP…\n");
  const health = await accountHealth({ ...draft, id: "test", createdAt: "" });
  if (!health.ok && !has(args, "skip-test")) throw new Error(`Connexion refusée : ${health.error}`);
  const account = store.add(draft);
  process.stderr.write(`Compte ajouté : ${account.id} (${health.inbox?.messages ?? "?"} messages dans la boîte de réception)\n`);
}

async function serveHttp(args: string[]) {
  const token = process.env.OMNIMAIL_HTTP_TOKEN;
  if (!token || token.length < 24) {
    throw new Error("OMNIMAIL_HTTP_TOKEN (24 caractères minimum) est obligatoire pour le mode HTTP.");
  }
  const port = Number(flag(args, "port") ?? process.env.PORT ?? 3333);
  const host = flag(args, "host") ?? process.env.HOST ?? "127.0.0.1";
  const expected = Buffer.from(`Bearer ${token}`);

  const http = createHttpServer(async (req, res) => {
    if (req.url === "/health") {
      res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ ok: true, version: VERSION }));
      return;
    }
    if (!req.url?.startsWith("/mcp")) {
      res.writeHead(404).end();
      return;
    }
    const given = Buffer.from(req.headers.authorization ?? "");
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
      res.writeHead(401, { "www-authenticate": "Bearer" }).end("Unauthorized");
      return;
    }
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : undefined;
    const server = createServer();
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on("close", () => {
      void transport.close();
      void server.close();
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, body);
  });
  http.listen(port, host, () => process.stderr.write(`omnimail MCP HTTP sur http://${host}:${port}/mcp\n`));
}

async function main() {
  const [cmd, sub, ...rest] = process.argv.slice(2);
  const args = [sub, ...rest].filter((x): x is string => x !== undefined);
  switch (cmd) {
    case undefined:
    case "serve":
      if (has(args, "http")) return serveHttp(args);
      await createServer().connect(new StdioServerTransport());
      process.stderr.write(`omnimail ${VERSION} prêt (stdio), données : ${dataDir()}\n`);
      return;
    case "accounts": {
      const store = new AccountStore();
      if (sub === "add") return addAccount(rest);
      if (sub === "list" || sub === undefined) {
        for (const a of store.list()) console.log(`${a.id}\t${a.address}\t${PRESETS[a.provider]?.label ?? a.provider}`);
        return;
      }
      if (sub === "test") {
        const list = rest[0] ? [store.get(rest[0])] : store.list();
        for (const h of await Promise.all(list.map(accountHealth))) {
          console.log(`${h.ok ? "OK " : "ERR"}\t${h.address}\t${h.ok ? `${h.inbox?.unseen ?? 0} non lus / ${h.inbox?.messages ?? 0}` : h.error}`);
        }
        return;
      }
      if (sub === "remove") {
        if (!rest[0]) throw new Error("Indiquez l'identifiant du compte.");
        store.remove(rest[0]);
        console.log(`Compte ${rest[0]} supprimé, secret effacé du coffre.`);
        return;
      }
      break;
    }
    case "providers":
      for (const p of Object.values(PRESETS)) console.log(`${p.id.padEnd(11)} ${p.label}${p.oauthOnly ? " (OAuth, bientôt)" : ""}`);
      return;
    case "settings":
      if (sub === "set") {
        const [key, value] = rest;
        const current = loadSettings();
        if (!key || !(key in current)) throw new Error(`Réglage inconnu. Réglages : ${Object.keys(current).join(", ")}`);
        const typed = typeof current[key as keyof Settings] === "boolean" ? value === "true" : typeof current[key as keyof Settings] === "number" ? Number(value) : value;
        console.log(JSON.stringify(saveSettings({ [key]: typed } as Partial<Settings>), null, 2));
        return;
      }
      console.log(JSON.stringify(loadSettings(), null, 2));
      return;
    case "--version":
    case "version":
      console.log(VERSION);
      return;
  }
  console.log(HELP);
}

main().catch((err) => {
  process.stderr.write(`Erreur : ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
