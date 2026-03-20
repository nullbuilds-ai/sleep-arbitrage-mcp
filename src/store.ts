import { readFileSync, writeFileSync, existsSync } from "fs";
import { randomUUID } from "crypto";
import { join } from "path";

export type TaskStatus = "queued" | "in_progress" | "completed" | "cancelled";

export interface Task {
  id: string;
  task: string;
  context?: string;
  delivery_email?: string;
  status: TaskStatus;
  created_at: string;
  updated_at: string;
  result?: string;
}

const DATA_FILE = process.env.SLEEP_ARBITRAGE_DATA_FILE ?? join(process.cwd(), "tasks.json");

function load(): Task[] {
  if (!existsSync(DATA_FILE)) return [];
  try {
    return JSON.parse(readFileSync(DATA_FILE, "utf8")) as Task[];
  } catch {
    return [];
  }
}

function save(tasks: Task[]): void {
  writeFileSync(DATA_FILE, JSON.stringify(tasks, null, 2), "utf8");
}

export function queueTask(
  task: string,
  context?: string,
  delivery_email?: string
): Task {
  const tasks = load();
  const now = new Date().toISOString();
  const entry: Task = {
    id: randomUUID(),
    task,
    context,
    delivery_email,
    status: "queued",
    created_at: now,
    updated_at: now,
  };
  tasks.push(entry);
  save(tasks);
  return entry;
}

export function listTasks(status?: TaskStatus): Task[] {
  const tasks = load();
  if (!status) return tasks;
  return tasks.filter((t) => t.status === status);
}

export function getTask(id: string): Task | undefined {
  return load().find((t) => t.id === id);
}

export function updateTaskStatus(
  id: string,
  status: TaskStatus,
  result?: string
): Task | undefined {
  const tasks = load();
  const idx = tasks.findIndex((t) => t.id === id);
  if (idx === -1) return undefined;
  tasks[idx] = {
    ...tasks[idx],
    status,
    updated_at: new Date().toISOString(),
    ...(result !== undefined ? { result } : {}),
  };
  save(tasks);
  return tasks[idx];
}
