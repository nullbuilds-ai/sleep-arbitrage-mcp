import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { queueTask, listTasks, getTask, updateTaskStatus } from "./store.js";
import type { TaskStatus } from "./store.js";

const server = new McpServer({
  name: "sleep-arbitrage",
  version: "0.1.0",
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
    delivery_email: z
      .string()
      .email()
      .optional()
      .describe("Where to send results when complete."),
  },
  async ({ task, context, delivery_email }) => {
    const entry = queueTask(task, context, delivery_email);
    return {
      content: [
        {
          type: "text",
          text: `Task queued.\n\nID: ${entry.id}\nStatus: ${entry.status}\nQueued at: ${entry.created_at}\n\nTask: ${entry.task}${entry.context ? `\nContext: ${entry.context}` : ""}${entry.delivery_email ? `\nDeliver to: ${entry.delivery_email}` : ""}`,
        },
      ],
    };
  }
);

server.tool(
  "list_tasks",
  "List all queued and completed tasks.",
  {
    status: z
      .enum(["queued", "in_progress", "completed", "cancelled"])
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
        `[${t.status.toUpperCase()}] ${t.id.slice(0, 8)} -- ${t.task.slice(0, 80)}${t.task.length > 80 ? "..." : ""} (${t.created_at.slice(0, 10)})`
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
      `Status: ${task.status}`,
      `Created: ${task.created_at}`,
      `Updated: ${task.updated_at}`,
      `Task: ${task.task}`,
      task.context ? `Context: ${task.context}` : null,
      task.delivery_email ? `Deliver to: ${task.delivery_email}` : null,
      task.result ? `Result:\n${task.result}` : null,
    ].filter(Boolean);
    return {
      content: [{ type: "text", text: lines.join("\n") }],
    };
  }
);

server.tool(
  "update_task",
  "Update a task's status or attach a result. Used by agents completing overnight work.",
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
    return {
      content: [
        {
          type: "text",
          text: `Updated.\n\nID: ${updated.id}\nStatus: ${updated.status}\nUpdated: ${updated.updated_at}${updated.result ? `\nResult: ${updated.result}` : ""}`,
        },
      ],
    };
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
