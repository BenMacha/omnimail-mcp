import nodemailer from "nodemailer";
import type { Account } from "./accounts.js";

export function createTransport(account: Account) {
  return nodemailer.createTransport({
    host: account.smtp.host,
    port: account.smtp.port,
    secure: account.smtp.secure,
    auth: { user: account.username, pass: account.secret },
    tls: account.tlsInsecure ? { rejectUnauthorized: false } : undefined,
  });
}

export async function sendRaw(account: Account, envelope: { from: string; to: string[] }, raw: Buffer | string) {
  const transport = createTransport(account);
  try {
    return await transport.sendMail({ envelope, raw });
  } finally {
    transport.close();
  }
}

export async function sendSimple(account: Account, mail: { to: string; subject: string; text: string }) {
  const transport = createTransport(account);
  try {
    return await transport.sendMail({ from: account.address, ...mail });
  } finally {
    transport.close();
  }
}
