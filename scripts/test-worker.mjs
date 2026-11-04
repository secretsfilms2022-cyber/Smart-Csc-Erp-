import { readFileSync } from "node:fs";

const source = readFileSync("dist-worker.js", "utf8");
const required = [
  "ATOMIC_MAIL_API_KEY",
  "https://mcp.atomicmail.ai/mcp",
  "/api/email/status",
  "/api/email/inbox",
  "/api/email/message",
  "/api/email/send",
  "/api/email/reply",
  "/api/email/sync",
  "/api/email/webhook",
  "/api/email/templates",
  "/health",
  "ATOMIC_MAIL_WEBHOOK_SECRET",
  "customer_communications",
  "surajkatira@smartcsc.work.gd"
];
const missing = required.filter((needle) => !source.includes(needle));
if (missing.length) {
  throw new Error("Worker integrity check failed; missing: " + missing.join(", "));
}
if (/[\u00C3\u00C2\u00E2]{2,}/.test(source)) {
  throw new Error("Worker integrity check failed; UTF-8 mojibake remains in deployed source");
}
if (/8fad7d9b-5609-4d14-b81d-5047cf01f41b/.test(source)) {
  throw new Error("Exposed Atomic Mail credential detected");
}
if (/CLOUDFLARE_API_TOKEN\s*=\s*["'][^"']+["']/.test(source)) {
  throw new Error("Exposed Cloudflare credential detected");
}

console.log("Worker integrity tests passed:", required.length, "required markers verified.");
