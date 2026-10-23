// Prints the coverage totals as a Markdown table (used for the GitHub job summary).
import { readFileSync } from "node:fs";

const total = JSON.parse(readFileSync("coverage/coverage-summary.json", "utf8")).total;
const rows = ["lines", "statements", "functions", "branches"].map((k) => `| ${k} | ${total[k].pct}% |`);
console.log(["### Coverage", "", "| Metric | % |", "|---|---|", ...rows].join("\n"));
