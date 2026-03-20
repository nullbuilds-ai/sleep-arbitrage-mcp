#!/usr/bin/env node
/**
 * Sleep Arbitrage Worker
 *
 * Drains the overnight queue by claiming tasks and executing them via Claude API.
 * Bundled in the same npm package as the MCP server.
 *
 * Usage:
 *   ANTHROPIC_API_KEY=sk-... npx sleep-arbitrage-worker drain
 *   ANTHROPIC_API_KEY=sk-... npx sleep-arbitrage-worker once
 */

import { claimNext, updateTaskStatus, listTasks, type Task } from "./store.js";
import { deliverResult } from "./deliver.js";

// --- Config ---

const MODEL = process.env.SLEEP_ARBITRAGE_MODEL ?? "claude-sonnet-4-6-20250514";
const MAX_TOKENS = parseInt(process.env.SLEEP_ARBITRAGE_MAX_TOKENS ?? "4096", 10);

const SYSTEM_PROMPT = `You are a research and analysis agent executing tasks queued for overnight processing.

Rules:
- Be thorough but concise. The user will read your result in the morning.
- Structure output with clear headers and bullet points.
- If the task requires information you don't have access to, say what you found and what's missing.
- If context is provided, use it to scope your work.
- End with a "Next Steps" section if applicable.`;

// --- Logging ---

function log(level: string, msg: string, ...args: unknown[]) {
  const ts = new Date().toISOString();
  console.error(`${ts} [${level}] ${msg}`, ...args);
}

// --- Lock (prevent concurrent workers) ---

import { openSync, closeSync, unlinkSync } from "fs";

let lockFd: number | null = null;
const LOCK_PATH = (process.env.SLEEP_ARBITRAGE_DATA_FILE ?? "tasks.json") + ".worker.lock";

function acquireLock(): boolean {
  try {
    // O_CREAT | O_EXCL: fails if file exists (atomic)
    lockFd = openSync(LOCK_PATH, "wx");
    return true;
  } catch {
    return false;
  }
}

function releaseLock() {
  if (lockFd !== null) {
    closeSync(lockFd);
    lockFd = null;
    try {
      unlinkSync(LOCK_PATH);
    } catch {
      // ignore
    }
  }
}

// --- Execution ---

async function executeTask(task: Task): Promise<string> {
  let Anthropic;
  try {
    const mod = await import("@anthropic-ai/sdk");
    Anthropic = mod.default ?? mod.Anthropic;
  } catch {
    throw new Error(
      "Missing dependency: npm install @anthropic-ai/sdk\n" +
        "The worker needs the Anthropic SDK to call Claude."
    );
  }

  const client = new Anthropic();

  let userMessage = `Task: ${task.task}`;
  if (task.context) {
    userMessage += `\n\nContext: ${task.context}`;
  }

  log("INFO", `Calling Claude API (model=${MODEL})`);

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userMessage }],
  });

  let result = "";
  for (const block of response.content) {
    if (block.type === "text") {
      result += block.text;
    }
  }

  log(
    "INFO",
    `Response: ${result.length} chars, ${response.usage.input_tokens} in / ${response.usage.output_tokens} out`
  );
  return result;
}

// --- Processing ---

async function processOne(): Promise<boolean> {
  const task = claimNext();
  if (!task) {
    log("INFO", "No queued tasks");
    return false;
  }

  const shortId = task.id.slice(0, 8);
  log("INFO", `Claimed ${shortId} [${task.priority}]: ${task.task.slice(0, 80)}`);

  try {
    const result = await executeTask(task);
    const updated = updateTaskStatus(task.id, "completed", result);
    log("INFO", `Completed ${shortId} (${result.length} chars)`);

    if (updated && (updated.delivery_email || updated.delivery_webhook)) {
      const delivery = await deliverResult(updated);
      if (delivery.email?.sent) log("INFO", `Email sent to ${updated.delivery_email}`);
      if (delivery.email && !delivery.email.sent) log("WARN", `Email failed: ${delivery.email.error}`);
      if (delivery.webhook?.sent) log("INFO", `Webhook delivered`);
      if (delivery.webhook && !delivery.webhook.sent) log("WARN", `Webhook failed: ${delivery.webhook.error}`);
    }

    return true;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log("ERROR", `Failed ${shortId}: ${msg}`);
    updateTaskStatus(task.id, "cancelled", `Cancelled: ${msg}`);
    return true; // processed (failed), don't retry immediately
  }
}

async function drain(): Promise<number> {
  let count = 0;
  while (await processOne()) {
    count++;
    await new Promise((r) => setTimeout(r, 1000)); // brief pause between tasks
  }
  log("INFO", `Done. Processed ${count} task(s).`);
  return count;
}

// --- Status ---

function showStatus() {
  const all = listTasks();
  const queued = all.filter((t) => t.status === "queued");
  const inProgress = all.filter((t) => t.status === "in_progress");
  const completed = all.filter((t) => t.status === "completed");

  console.log(`\nSleep Arbitrage Queue Status`);
  console.log(`${"=".repeat(40)}`);
  console.log(`  Queued:      ${queued.length}`);
  console.log(`  In Progress: ${inProgress.length}`);
  console.log(`  Completed:   ${completed.length}`);
  console.log(`  Total:       ${all.length}`);

  if (queued.length > 0) {
    console.log(`\nQueued tasks:`);
    for (const t of queued) {
      console.log(`  [${t.priority}] ${t.id.slice(0, 8)} -- ${t.task.slice(0, 60)}`);
    }
  }

  const recent = completed
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
    .slice(0, 3);
  if (recent.length > 0) {
    console.log(`\nRecent completions:`);
    for (const t of recent) {
      console.log(`  ${t.id.slice(0, 8)} -- ${t.task.slice(0, 60)} (${t.updated_at.slice(0, 10)})`);
    }
  }
  console.log();
}

// --- CLI ---

async function main() {
  const args = process.argv.slice(2);
  const command = args[0] ?? "drain";

  if (command === "status") {
    showStatus();
    return;
  }

  if (command === "help" || command === "--help" || command === "-h") {
    console.log(`
sleep-arbitrage-worker - Drain the overnight task queue

Usage:
  sleep-arbitrage-worker drain     Process all queued tasks (default)
  sleep-arbitrage-worker once      Process one task and exit
  sleep-arbitrage-worker status    Show queue status
  sleep-arbitrage-worker help      Show this help

Environment:
  ANTHROPIC_API_KEY              Required for drain/once
  SLEEP_ARBITRAGE_DATA_FILE      Path to tasks.json (default: ./tasks.json)
  SLEEP_ARBITRAGE_MODEL          Model (default: claude-sonnet-4-6-20250514)
  SLEEP_ARBITRAGE_MAX_TOKENS     Max tokens (default: 4096)
  RESEND_API_KEY                 Optional, for email delivery
`);
    return;
  }

  // Validate API key before starting
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("Error: ANTHROPIC_API_KEY is required.\n");
    console.error("  ANTHROPIC_API_KEY=sk-ant-... sleep-arbitrage-worker drain\n");
    process.exit(1);
  }

  if (!acquireLock()) {
    log("WARN", "Another worker is running. Exiting.");
    process.exit(0);
  }

  // Clean up on exit
  process.on("SIGINT", () => {
    releaseLock();
    process.exit(0);
  });
  process.on("SIGTERM", () => {
    releaseLock();
    process.exit(0);
  });

  try {
    if (command === "once") {
      await processOne();
    } else if (command === "drain") {
      await drain();
    } else {
      console.error(`Unknown command: ${command}`);
      console.error(`Run "sleep-arbitrage-worker help" for usage.`);
      process.exit(1);
    }
  } finally {
    releaseLock();
  }
}

main().catch((err) => {
  console.error(err);
  releaseLock();
  process.exit(1);
});
