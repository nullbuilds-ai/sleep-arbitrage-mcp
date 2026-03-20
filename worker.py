#!/usr/bin/env python3
"""
Sleep Arbitrage Worker

Reference implementation for draining the overnight queue.
Claims tasks, executes them via Claude API, writes results back.

Requirements:
    pip install anthropic

Usage:
    # Process all queued tasks
    ANTHROPIC_API_KEY=sk-... python worker.py drain

    # Process one task and exit
    ANTHROPIC_API_KEY=sk-... python worker.py once

Environment variables:
    ANTHROPIC_API_KEY           Required. Your Anthropic API key.
    SLEEP_ARBITRAGE_DATA_FILE   Path to tasks.json (default: ./tasks.json)
    SLEEP_ARBITRAGE_MODEL       Model to use (default: claude-sonnet-4-6-20250514)
    SLEEP_ARBITRAGE_MAX_TOKENS  Max response tokens (default: 4096)
    RESEND_API_KEY              Optional. For email delivery via Resend.
    SLEEP_ARBITRAGE_FROM_EMAIL  Sender address for email delivery.

Scheduling (macOS launchd):
    See examples/launchd.plist for an overnight schedule template.

Scheduling (cron):
    # Every 30 minutes from 11pm to 7am
    */30 23,0-7 * * * ANTHROPIC_API_KEY=sk-... python3 /path/to/worker.py drain
"""
from __future__ import annotations

import json
import os
import sys
import time
import logging
import fcntl
from datetime import datetime, timezone
from typing import Optional

import anthropic

# --- Config ---

DATA_FILE = os.environ.get("SLEEP_ARBITRAGE_DATA_FILE", "tasks.json")
MODEL = os.environ.get("SLEEP_ARBITRAGE_MODEL", "claude-sonnet-4-6-20250514")
MAX_TOKENS = int(os.environ.get("SLEEP_ARBITRAGE_MAX_TOKENS", "4096"))
RESEND_API_KEY = os.environ.get("RESEND_API_KEY", "")
FROM_EMAIL = os.environ.get("SLEEP_ARBITRAGE_FROM_EMAIL", "results@sleeparbitrage.com")

PRIORITY_ORDER = {"urgent": 0, "normal": 1, "low": 2}

SYSTEM_PROMPT = """You are a research and analysis agent executing tasks queued for overnight processing.

Rules:
- Be thorough but concise. The user will read your result in the morning.
- Structure output with clear headers and bullet points.
- If the task requires information you don't have access to, say what you found and what's missing.
- If context is provided, use it to scope your work.
- End with a "Next Steps" section if applicable."""

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.StreamHandler()],
)
log = logging.getLogger("sleep-worker")


# --- Store operations (mirrors the MCP server's store.ts) ---


def load_tasks() -> list:
    try:
        with open(DATA_FILE) as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return []


def save_tasks(tasks: list) -> None:
    from pathlib import Path

    path = Path(DATA_FILE)
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(tasks, indent=2))
    tmp.rename(path)


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def expire_stale(tasks: list) -> bool:
    now = now_iso()
    changed = False
    for t in tasks:
        if t["status"] == "queued" and t.get("expires_at") and t["expires_at"] < now:
            t["status"] = "expired"
            t["updated_at"] = now
            changed = True
    return changed


def claim_next_task() -> Optional[dict]:
    """Claim highest-priority oldest queued task. Returns the task or None."""
    tasks = load_tasks()
    expire_stale(tasks)

    queued = [t for t in tasks if t["status"] == "queued"]
    queued.sort(key=lambda t: (PRIORITY_ORDER.get(t["priority"], 1), t["created_at"]))

    if not queued:
        return None

    target_id = queued[0]["id"]
    for t in tasks:
        if t["id"] == target_id:
            t["status"] = "in_progress"
            t["claimed_at"] = now_iso()
            t["updated_at"] = now_iso()
            save_tasks(tasks)
            return t
    return None


def complete_task(task_id: str, result: str) -> Optional[dict]:
    tasks = load_tasks()
    for t in tasks:
        if t["id"] == task_id:
            t["status"] = "completed"
            t["result"] = result
            t["updated_at"] = now_iso()
            save_tasks(tasks)
            return t
    return None


def cancel_task(task_id: str, reason: str) -> Optional[dict]:
    tasks = load_tasks()
    for t in tasks:
        if t["id"] == task_id:
            t["status"] = "cancelled"
            t["result"] = "Cancelled: %s" % reason
            t["updated_at"] = now_iso()
            save_tasks(tasks)
            return t
    return None


# --- Execution ---


def execute_task(task: dict) -> str:
    """Send task to Claude API and return the result."""
    client = anthropic.Anthropic()

    user_message = "Task: %s" % task["task"]
    if task.get("context"):
        user_message += "\n\nContext: %s" % task["context"]

    log.info("Calling Claude API (model=%s)", MODEL)

    response = client.messages.create(
        model=MODEL,
        max_tokens=MAX_TOKENS,
        system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": user_message}],
    )

    result_text = ""
    for block in response.content:
        if block.type == "text":
            result_text += block.text

    log.info(
        "Response: %d chars, %d input / %d output tokens",
        len(result_text),
        response.usage.input_tokens,
        response.usage.output_tokens,
    )
    return result_text


# --- Delivery ---


def deliver_email(task: dict) -> None:
    if not task.get("delivery_email") or not RESEND_API_KEY:
        if task.get("delivery_email") and not RESEND_API_KEY:
            log.warning("Email requested but RESEND_API_KEY not set")
        return

    try:
        import requests

        resp = requests.post(
            "https://api.resend.com/emails",
            headers={
                "Authorization": "Bearer %s" % RESEND_API_KEY,
                "Content-Type": "application/json",
            },
            json={
                "from": FROM_EMAIL,
                "to": task["delivery_email"],
                "subject": "Task complete: %s" % task["task"][:60],
                "text": "Task: %s\n\nResult:\n%s" % (task["task"], task.get("result", "")),
            },
            timeout=30,
        )
        log.info("Email %s: %s", "sent" if resp.ok else "failed", task["delivery_email"])
    except Exception as e:
        log.error("Email delivery error: %s", e)


def deliver_webhook(task: dict) -> None:
    if not task.get("delivery_webhook"):
        return

    try:
        import requests

        resp = requests.post(
            task["delivery_webhook"],
            json={
                "event": "task.completed",
                "task": {
                    "id": task["id"],
                    "task": task["task"],
                    "context": task.get("context"),
                    "status": task["status"],
                    "result": task.get("result"),
                    "created_at": task["created_at"],
                    "updated_at": task["updated_at"],
                },
            },
            timeout=30,
        )
        log.info("Webhook: %d %s", resp.status_code, task["delivery_webhook"])
    except Exception as e:
        log.error("Webhook error: %s", e)


# --- Lock (prevent concurrent workers) ---


def acquire_lock() -> Optional[int]:
    lock_path = DATA_FILE + ".lock"
    fd = os.open(lock_path, os.O_CREAT | os.O_WRONLY)
    try:
        fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        return fd
    except OSError:
        os.close(fd)
        return None


def release_lock(fd: int) -> None:
    fcntl.flock(fd, fcntl.LOCK_UN)
    os.close(fd)


# --- Main ---


def process_one() -> bool:
    """Claim and execute one task. Returns True if a task was processed."""
    task = claim_next_task()
    if not task:
        log.info("No queued tasks")
        return False

    short_id = task["id"][:8]
    log.info("Claimed %s [%s]: %s", short_id, task["priority"], task["task"][:80])

    try:
        result = execute_task(task)
        updated = complete_task(task["id"], result)
        log.info("Completed %s (%d chars)", short_id, len(result))

        if updated:
            deliver_email(updated)
            deliver_webhook(updated)

        return True

    except Exception as e:
        log.error("Failed %s: %s", short_id, e)
        cancel_task(task["id"], str(e))
        return True  # processed (failed), don't retry immediately


def run_drain() -> int:
    """Process all queued tasks until empty."""
    count = 0
    while process_one():
        count += 1
        time.sleep(1)
    log.info("Done. Processed %d task(s).", count)
    return count


def main():
    lock_fd = acquire_lock()
    if lock_fd is None:
        log.warning("Another worker is running. Exiting.")
        sys.exit(0)

    try:
        mode = sys.argv[1] if len(sys.argv) > 1 else "drain"

        if mode == "once":
            process_one()
        elif mode == "drain":
            run_drain()
        else:
            print("Usage: %s [once|drain]" % sys.argv[0])
            print("  once  - process one task and exit")
            print("  drain - process all queued tasks and exit (default)")
            sys.exit(1)
    finally:
        release_lock(lock_fd)


if __name__ == "__main__":
    main()
