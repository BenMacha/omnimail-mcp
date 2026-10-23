#!/usr/bin/env node
import { timingSafeEqual } from "node:crypto";
import { realpathSync } from "node:fs";
import { createServer as createHttpServer } from "node:http";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { AccountStore } from "./accounts.js";
import { flag, has, parseSettingValue } from "./args.js";
import { dataDir, loadSettings, saveSettings } from "./config.js";
import { PRESETS, presetForAddress } from "./presets.js";
import { createServer, VERSION } from "./server.js";
import { accountHealth } from "./services/read.js";

const HELP = `omnimail ${VERSION} — multi-account e-mail MCP server

Usage:
  omnimail serve                       MCP server over stdio (Claude Code, Claude Desktop…)
  omnimail serve --http [--port 3333] [--host 127.0.0.1]
                                       MCP server over HTTP (Streamable HTTP), OMNIMAIL_HTTP_TOKEN required
  omnimail accounts add                Interactive account setup
  omnimail accounts add --address A [--provider P] [--username U] [--name N]
        [--imap-host H --imap-port 993 --imap-starttls] [--smtp-host H --smtp-port 465 --smtp-starttls]
        --password-stdin               Non-interactive setup (password read from stdin)
  omnimail accounts list               List accounts
  omnimail accounts test [id]          Test connections
  omnimail accounts remove <id>        Remove an account and its secret
  omnimail providers                   Preconfigured providers
  omnimail settings get
  omnimail settings set <key> <value>  e.g. sendEnabled true, language fr

Data: $OMNIMAIL_DATA_DIR, /data (Docker) or ~/.omnimail`;

function ask(question: string, hidden = false): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stderr, terminal: true });
    if (hidden) {
      const out = rl as unknown as { _writeToOutput: (s: string) => void };
      const write = out._writeToOutput;
      out._writeToOutput = (s: string) => {
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
  const address = flag(args, "address") ?? (interactive ? await ask("E-mail address: ") : undefined);
  if (!address) throw new Error("--address is required.");
  const guessed = presetForAddress(address);
  let providerId = flag(args, "provider") ?? guessed?.id;
  if (!providerId && interactive && !flag(args, "imap-host")) {
    process.stderr.write(`Providers: ${Object.keys(PRESETS).join(", ")}, generic\n`);
    providerId = (await ask("Provider: ")) || "generic";
  }
  providerId = providerId ?? "generic";
  const preset = PRESETS[providerId];
  if (preset?.oauthOnly) throw new Error(`${preset.label}: ${preset.note}`);

  let imap = preset?.imap;
  let smtp = preset?.smtp;
  const imapHost = flag(args, "imap-host") ?? (!preset && interactive ? await ask("IMAP server: ") : undefined);
  if (imapHost) imap = { host: imapHost, port: Number(flag(args, "imap-port") ?? 993), secure: !has(args, "imap-starttls") };
  const smtpHost = flag(args, "smtp-host") ?? (!preset && interactive ? await ask("SMTP server: ") : undefined);
  if (smtpHost) smtp = { host: smtpHost, port: Number(flag(args, "smtp-port") ?? 465), secure: !has(args, "smtp-starttls") };
  if (!imap || !smtp) throw new Error("Unknown IMAP and SMTP servers: use --provider or --imap-host / --smtp-host.");

  if (interactive && preset) {
    process.stderr.write(`\n${preset.label}${preset.note ? ` — ${preset.note}` : ""}\n`);
    if (preset.appPasswordUrl) process.stderr.write(`Create an app password here: ${preset.appPasswordUrl}\n`);
    process.stderr.write("Never use the account's main password.\n\n");
  }
  const username = flag(args, "username") ?? address;
  const secret = interactive ? await ask("App password (hidden): ", true) : await readStdin();
  if (!secret) throw new Error("Empty password.");

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
  process.stderr.write("Testing the IMAP connection…\n");
  const health = await accountHealth({ ...draft, id: "test", createdAt: "" });
  if (!health.ok && !has(args, "skip-test")) throw new Error(`Connection refused: ${health.error}`);
  const account = store.add(draft);
  process.stderr.write(`Account added: ${account.id} (${health.inbox?.messages ?? "?"} messages in the inbox)\n`);
}

async function serveHttp(args: string[]) {
  const token = process.env.OMNIMAIL_HTTP_TOKEN;
  if (!token || token.length < 24) {
    throw new Error("OMNIMAIL_HTTP_TOKEN (at least 24 characters) is required for HTTP mode.");
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
    let body: unknown;
    try {
      body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : undefined;
    } catch {
      res.writeHead(400).end("Invalid JSON");
      return;
    }
    const server = createServer();
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on("close", () => {
      void transport.close();
      void server.close();
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, body);
  });
  http.listen(port, host, () => process.stderr.write(`omnimail MCP over HTTP on http://${host}:${port}/mcp\n`));
}

export async function main(argv = process.argv.slice(2)) {
  const [cmd, sub, ...rest] = argv;
  const args = [sub, ...rest].filter((x): x is string => x !== undefined);
  switch (cmd) {
    case undefined:
    case "serve":
      if (has(args, "http")) return serveHttp(args);
      await createServer().connect(new StdioServerTransport());
      process.stderr.write(`omnimail ${VERSION} ready (stdio), data: ${dataDir()}\n`);
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
          console.log(
            `${h.ok ? "OK " : "ERR"}\t${h.address}\t${h.ok ? `${h.inbox?.unseen ?? 0} unread / ${h.inbox?.messages ?? 0}` : h.error}`,
          );
        }
        return;
      }
      if (sub === "remove") {
        if (!rest[0]) throw new Error("Give the account id.");
        store.remove(rest[0]);
        console.log(`Account ${rest[0]} removed, secret erased from the vault.`);
        return;
      }
      break;
    }
    case "providers":
      for (const p of Object.values(PRESETS)) console.log(`${p.id.padEnd(11)} ${p.label}${p.oauthOnly ? " (OAuth, coming soon)" : ""}`);
      return;
    case "settings":
      if (sub === "set") {
        const [key, value] = rest;
        if (!key) throw new Error("Usage: omnimail settings set <key> <value>");
        console.log(JSON.stringify(saveSettings(parseSettingValue(loadSettings(), key, value)), null, 2));
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

function isEntryPoint(): boolean {
  try {
    return realpathSync(process.argv[1] ?? "") === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isEntryPoint()) {
  main().catch((err) => {
    process.stderr.write(`Error: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  });
}
