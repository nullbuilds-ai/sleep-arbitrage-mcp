import { Resend } from "resend";
import type { Task } from "./store.js";

const FROM_EMAIL =
  process.env.SLEEP_ARBITRAGE_FROM_EMAIL ?? "results@sleeparbitrage.com";

let resend: Resend | null = null;

function getResend(): Resend | null {
  if (!process.env.RESEND_API_KEY) return null;
  if (!resend) resend = new Resend(process.env.RESEND_API_KEY);
  return resend;
}

export interface DeliveryResult {
  email?: { sent: boolean; error?: string };
  webhook?: { sent: boolean; status?: number; error?: string };
}

export async function deliverResult(task: Task): Promise<DeliveryResult> {
  const result: DeliveryResult = {};

  // Email delivery
  if (task.delivery_email) {
    const client = getResend();
    if (!client) {
      result.email = {
        sent: false,
        error: "RESEND_API_KEY not configured",
      };
    } else {
      try {
        await client.emails.send({
          from: FROM_EMAIL,
          to: task.delivery_email,
          subject: `Task complete: ${task.task.slice(0, 60)}${task.task.length > 60 ? "..." : ""}`,
          html: buildEmailHtml(task),
        });
        result.email = { sent: true };
      } catch (err) {
        result.email = {
          sent: false,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    }
  }

  // Webhook delivery
  if (task.delivery_webhook) {
    try {
      const res = await fetch(task.delivery_webhook, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event: "task.completed",
          task: {
            id: task.id,
            task: task.task,
            context: task.context,
            status: task.status,
            result: task.result,
            created_at: task.created_at,
            updated_at: task.updated_at,
          },
        }),
      });
      result.webhook = { sent: res.ok, status: res.status };
    } catch (err) {
      result.webhook = {
        sent: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  return result;
}

function buildEmailHtml(task: Task): string {
  return `
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
  <h2 style="margin: 0 0 16px 0; font-size: 20px; color: #111;">Task Complete</h2>
  <div style="background: #f8f8f8; border-radius: 8px; padding: 16px; margin-bottom: 16px;">
    <p style="margin: 0 0 8px 0; font-size: 14px; color: #666;">Task</p>
    <p style="margin: 0; font-size: 16px; color: #111;">${escapeHtml(task.task)}</p>
  </div>
  ${task.context ? `
  <div style="background: #f8f8f8; border-radius: 8px; padding: 16px; margin-bottom: 16px;">
    <p style="margin: 0 0 8px 0; font-size: 14px; color: #666;">Context</p>
    <p style="margin: 0; font-size: 14px; color: #333;">${escapeHtml(task.context)}</p>
  </div>` : ""}
  ${task.result ? `
  <div style="background: #f0fdf4; border-radius: 8px; padding: 16px; margin-bottom: 16px; border-left: 3px solid #22c55e;">
    <p style="margin: 0 0 8px 0; font-size: 14px; color: #666;">Result</p>
    <pre style="margin: 0; font-size: 14px; color: #111; white-space: pre-wrap; word-break: break-word;">${escapeHtml(task.result)}</pre>
  </div>` : ""}
  <p style="margin: 16px 0 0 0; font-size: 12px; color: #999;">
    Task ${task.id.slice(0, 8)} completed at ${task.updated_at}<br>
    Powered by Sleep Arbitrage
  </p>
</div>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
