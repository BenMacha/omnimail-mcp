import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export interface PromptDef {
  name: string;
  title: string;
  text: string;
}

/** Ready-made MCP prompts. The assistant answers in the user's language. */
export const PROMPTS: PromptDef[] = [
  {
    name: "morning-triage",
    title: "Morning triage",
    text:
      "Using omnimail: search unread messages from the last 24 hours in all my accounts (mail_search unread=true since=yesterday). " +
      "Sort them into four groups: urgent, to answer, for information, noise. One line per message: account, sender, subject, why. " +
      "Do not change or send anything.",
  },
  {
    name: "newsletter-cleanup",
    title: "Newsletter cleanup",
    text:
      "Using omnimail: run recurring_senders_list over 90 days. Show a table of recurring senders sorted by volume, with read rate " +
      "and unsubscribe method. Suggest which ones to unsubscribe from (high volume, rarely read). After my choice, prepare " +
      "unsubscribe_plan (thenMove as I answer), show the plan and wait for my approval before plan_apply.",
  },
  {
    name: "sort-into-folders",
    title: "Sort the mailbox into sub-folders",
    text:
      "Using omnimail: prepare classify_plan on my inbox (mode category, read messages older than 7 days). " +
      "Show how many messages would go into each folder, with examples. Suggest custom rules if you see important senders. " +
      "Apply only after my approval, and remind me that plan_undo can revert everything.",
  },
  {
    name: "deep-cleanup",
    title: "Deep cleanup",
    text:
      "Using omnimail: prepare a cleanup_plan for the newsletters, notifications and social categories, read messages older than " +
      "180 days, action archive. Also prepare a separate plan for messages over 5 MB older than one year. Show both plans and wait " +
      "for my approval.",
  },
  {
    name: "scam-detector",
    title: "Scam detector",
    text:
      "Using omnimail: take the 25 latest messages of my inbox, run spam_check on them and show the suspicious or very suspicious " +
      "ones with the reasons, in plain words. Do not click any link or open any attachment.",
  },
  {
    name: "pending-replies",
    title: "Pending replies",
    text:
      "Using omnimail: find messages from the last 14 days, sent by people (not newsletters or notifications), that I have not " +
      "answered. Suggest a reply draft for the most important ones with draft_reply, without sending anything.",
  },
];

export function registerPrompts(server: McpServer): void {
  for (const p of PROMPTS) {
    server.registerPrompt(p.name, { title: p.title, description: p.title }, () => ({
      messages: [{ role: "user", content: { type: "text", text: p.text } }],
    }));
  }
}
