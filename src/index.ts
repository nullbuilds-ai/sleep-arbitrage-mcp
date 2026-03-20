#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { queueTask, listTasks, getTask, claimNext, updateTaskStatus } from "./store.js";
import { deliverResult } from "./deliver.js";
import type { TaskStatus, TaskPriority } from "./store.js";

const server = new McpServer({
  name: "sleep-arbitrage",
  version: "0.3.0",
});

server.tool(
  "queue_task",
  "Queue a task for overnight agent execution. Hand it off before you sleep, get results in the morning.",
  {
    task: z.string().describe("What you want done. Be specific."),
    context: z
      .string()
      .optional()
      .describe("Background info, constraints, or links the agent will need."),
    priority: z
      .enum(["urgent", "normal", "low"])
      .optional()
      .describe("Task priority. Urgent tasks get claimed first. Defaults to normal."),
    expires_in_hours: z
      .number()
      .positive()
      .optional()
      .describe("Hours until this task expires if not claimed. Omit for no expiry."),
    delivery_email: z
      .string()
      .email()
      .optional()
      .describe("Where to send results when complete."),
    delivery_webhook: z
      .string()
      .url()
      .optional()
      .describe("Webhook URL to POST results to when complete."),
  },
  async ({ task, context, priority, expires_in_hours, delivery_email, delivery_webhook }) => {
    const entry = queueTask(
      task,
      context,
      delivery_email,
      delivery_webhook,
      (priority as TaskPriority) ?? "normal",
      expires_in_hours
    );
    const details: string[] = [
      `Task queued.`,
      ``,
      `ID: ${entry.id}`,
      `Priority: ${entry.priority}`,
      `Status: ${entry.status}`,
      `Queued at: ${entry.created_at}`,
    ];
    if (entry.expires_at) details.push(`Expires at: ${entry.expires_at}`);
    details.push(``, `Task: ${entry.task}`);
    if (entry.context) details.push(`Context: ${entry.context}`);
    if (entry.delivery_email) details.push(`Email delivery: ${entry.delivery_email}`);
    if (entry.delivery_webhook) details.push(`Webhook delivery: ${entry.delivery_webhook}`);
    return { content: [{ type: "text", text: details.join("\n") }] };
  }
);

server.tool(
  "claim_next",
  "Claim the next available task from the queue. Returns the highest-priority, oldest queued task and sets it to in_progress. Used by agents working through the overnight queue.",
  {},
  async () => {
    const task = claimNext();
    if (!task) {
      return {
        content: [{ type: "text", text: "No tasks in the queue." }],
      };
    }
    const lines = [
      `Claimed.`,
      ``,
      `ID: ${task.id}`,
      `Priority: ${task.priority}`,
      `Claimed at: ${task.claimed_at}`,
      ``,
      `Task: ${task.task}`,
    ];
    if (task.context) lines.push(`Context: ${task.context}`);
    if (task.expires_at) lines.push(`Expires at: ${task.expires_at}`);
    return { content: [{ type: "text", text: lines.join("\n") }] };
  }
);

server.tool(
  "list_tasks",
  "List all queued and completed tasks.",
  {
    status: z
      .enum(["queued", "in_progress", "completed", "cancelled", "expired"])
      .optional()
      .describe("Filter by status. Omit to list all."),
  },
  async ({ status }) => {
    const tasks = listTasks(status as TaskStatus | undefined);
    if (tasks.length === 0) {
      return {
        content: [
          {
            type: "text",
            text: status ? `No tasks with status: ${status}` : "No tasks yet.",
          },
        ],
      };
    }
    const lines = tasks.map(
      (t) =>
        `[${t.status.toUpperCase()}] [${t.priority}] ${t.id.slice(0, 8)} -- ${t.task.slice(0, 70)}${t.task.length > 70 ? "..." : ""} (${t.created_at.slice(0, 10)})`
    );
    return {
      content: [
        {
          type: "text",
          text: `${tasks.length} task(s):\n\n${lines.join("\n")}`,
        },
      ],
    };
  }
);

server.tool(
  "get_task",
  "Fetch full details of a task by ID.",
  {
    id: z.string().describe("Task ID (full or first 8 characters)."),
  },
  async ({ id }) => {
    const tasks = listTasks();
    const task = tasks.find((t) => t.id === id || t.id.startsWith(id));
    if (!task) {
      return {
        content: [{ type: "text", text: `No task found for ID: ${id}` }],
      };
    }
    const lines = [
      `ID: ${task.id}`,
      `Priority: ${task.priority}`,
      `Status: ${task.status}`,
      `Created: ${task.created_at}`,
      `Updated: ${task.updated_at}`,
    ];
    if (task.claimed_at) lines.push(`Claimed: ${task.claimed_at}`);
    if (task.expires_at) lines.push(`Expires: ${task.expires_at}`);
    lines.push(`Task: ${task.task}`);
    if (task.context) lines.push(`Context: ${task.context}`);
    if (task.delivery_email) lines.push(`Email delivery: ${task.delivery_email}`);
    if (task.delivery_webhook) lines.push(`Webhook delivery: ${task.delivery_webhook}`);
    if (task.result) lines.push(`Result:\n${task.result}`);
    return {
      content: [{ type: "text", text: lines.join("\n") }],
    };
  }
);

server.tool(
  "update_task",
  "Update a task's status or attach a result. Used by agents completing overnight work. Automatically delivers results via email/webhook when status is set to completed.",
  {
    id: z.string().describe("Task ID (full or first 8 characters)."),
    status: z.enum(["queued", "in_progress", "completed", "cancelled"]),
    result: z
      .string()
      .optional()
      .describe("Output or summary from the agent."),
  },
  async ({ id, status, result }) => {
    const tasks = listTasks();
    const match = tasks.find((t) => t.id === id || t.id.startsWith(id));
    if (!match) {
      return {
        content: [{ type: "text", text: `No task found for ID: ${id}` }],
      };
    }
    const updated = updateTaskStatus(match.id, status as TaskStatus, result);
    if (!updated) {
      return {
        content: [{ type: "text", text: "Update failed." }],
      };
    }

    let deliveryReport = "";
    if (status === "completed" && (updated.delivery_email || updated.delivery_webhook)) {
      const delivery = await deliverResult(updated);
      const parts: string[] = [];
      if (delivery.email) {
        parts.push(
          delivery.email.sent
            ? `Email sent to ${updated.delivery_email}`
            : `Email failed: ${delivery.email.error}`
        );
      }
      if (delivery.webhook) {
        parts.push(
          delivery.webhook.sent
            ? `Webhook delivered (${delivery.webhook.status})`
            : `Webhook failed: ${delivery.webhook.error}`
        );
      }
      if (parts.length > 0) {
        deliveryReport = `\nDelivery: ${parts.join(", ")}`;
      }
    }

    return {
      content: [
        {
          type: "text",
          text: `Updated.\n\nID: ${updated.id}\nStatus: ${updated.status}\nUpdated: ${updated.updated_at}${updated.result ? `\nResult: ${updated.result}` : ""}${deliveryReport}`,
        },
      ],
    };
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
