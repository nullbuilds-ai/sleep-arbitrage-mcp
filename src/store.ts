import { readFileSync, writeFileSync, existsSync } from "fs";
import { randomUUID } from "crypto";
import { join } from "path";

export type TaskStatus = "queued" | "in_progress" | "completed" | "cancelled" | "expired";
export type TaskPriority = "urgent" | "normal" | "low";

const PRIORITY_ORDER: Record<TaskPriority, number> = {
  urgent: 0,
  normal: 1,
  low: 2,
};

export interface Task {
  id: string;
  task: string;
  context?: string;
  delivery_email?: string;
  delivery_webhook?: string;
  priority: TaskPriority;
  status: TaskStatus;
  created_at: string;
  updated_at: string;
  expires_at?: string;
  claimed_at?: string;
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

function expireStaleTasks(tasks: Task[]): boolean {
  const now = new Date().toISOString();
  let changed = false;
  for (const t of tasks) {
    if (t.status === "queued" && t.expires_at && t.expires_at < now) {
      t.status = "expired";
      t.updated_at = now;
      changed = true;
    }
  }
  return changed;
}

export function queueTask(
  task: string,
  context?: string,
  delivery_email?: string,
  delivery_webhook?: string,
  priority: TaskPriority = "normal",
  expires_in_hours?: number
): Task {
  const tasks = load();
  const now = new Date();
  const entry: Task = {
    id: randomUUID(),
    task,
    context,
    delivery_email,
    delivery_webhook,
    priority,
    status: "queued",
    created_at: now.toISOString(),
    updated_at: now.toISOString(),
    ...(expires_in_hours
      ? { expires_at: new Date(now.getTime() + expires_in_hours * 3600000).toISOString() }
      : {}),
  };
  tasks.push(entry);
  save(tasks);
  return entry;
}

export function listTasks(status?: TaskStatus): Task[] {
  const tasks = load();
  if (expireStaleTasks(tasks)) save(tasks);
  if (!status) return tasks;
  return tasks.filter((t) => t.status === status);
}

export function getTask(id: string): Task | undefined {
  return load().find((t) => t.id === id);
}

export function claimNext(): Task | undefined {
  const tasks = load();
  if (expireStaleTasks(tasks)) save(tasks);

  const queued = tasks
    .filter((t) => t.status === "queued")
    .sort((a, b) => {
      const pDiff = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
      if (pDiff !== 0) return pDiff;
      return a.created_at.localeCompare(b.created_at);
    });

  if (queued.length === 0) return undefined;

  const target = queued[0];
  const idx = tasks.findIndex((t) => t.id === target.id);
  const now = new Date().toISOString();
  tasks[idx] = {
    ...tasks[idx],
    status: "in_progress",
    claimed_at: now,
    updated_at: now,
  };
  save(tasks);
  return tasks[idx];
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
