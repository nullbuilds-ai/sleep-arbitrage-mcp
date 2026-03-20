<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="assets/logo-dark.svg">
  <source media="(prefers-color-scheme: light)" srcset="assets/logo-light.svg">
  <img alt="sleep arbitrage" src="assets/logo-dark.svg" width="400">
</picture>

<br><br>

**Queue work before you sleep. Get results in the morning.**

[![npm](https://img.shields.io/npm/v/sleep-arbitrage-mcp?style=flat-square&color=black)](https://www.npmjs.com/package/sleep-arbitrage-mcp)
[![license](https://img.shields.io/badge/license-MIT-black?style=flat-square)](LICENSE)
[![MCP](https://img.shields.io/badge/protocol-MCP-black?style=flat-square)](https://modelcontextprotocol.io)

*An MCP server for async task handoff. Built by [NULL](https://x.com/nullbuilds).*

</div>

---

## The idea

You stop working at 11pm. Your agents don't. The gap between when you sleep and when you need results is the arbitrage.

This is the intake layer for that.

---

## How it works

```
  YOU (11pm)                    AGENT (3am)                   YOU (7am)
  ┌─────────────┐              ┌─────────────┐              ┌─────────────┐
  │ "Queue this │  queue_task  │ claim_next  │  update_task │ "What       │
  │  for        │ ──────────►  │ do the work │ ──────────►  │  finished?" │
  │  tonight"   │              │ attach      │              │             │
  │             │              │ results     │              │  list_tasks │
  └─────────────┘              └─────────────┘              └─────────────┘
```

No dashboard. No email. No extra app. You're already in Claude. That's the interface.

---

## Install

```bash
npm install -g sleep-arbitrage-mcp
```

## Setup (Claude Desktop)

```json
{
  "mcpServers": {
    "sleep-arbitrage": {
      "command": "sleep-arbitrage-mcp",
      "env": {
        "SLEEP_ARBITRAGE_DATA_FILE": "/path/to/tasks.json"
      }
    }
  }
}
```

## From source

```bash
git clone https://github.com/nullbuilds-ai/sleep-arbitrage-mcp
cd sleep-arbitrage-mcp
npm install && npm run build
```

---

## Tools

| Tool | Description |
|:-----|:------------|
| `queue_task` | Submit work with priority, expiry, and optional delivery config |
| `claim_next` | Grab the next task. Highest priority, oldest first. Atomic. |
| `list_tasks` | View queue. Filter by status. |
| `get_task` | Full details by ID |
| `update_task` | Mark done, attach results. Auto-delivers if configured. |

---

## Agent pickup loop

`claim_next` is how agents work through the queue overnight. It's atomic: claims a task and sets it to `in_progress` in one operation.

```
claim_next ─► do the work ─► update_task ─► claim_next ─► ...
                                                    └─► "No tasks in the queue."
```

**Priority order:** `urgent` > `normal` > `low`, then oldest first.

**Expiry:** Pass `expires_in_hours` when queuing. Stale tasks get skipped automatically.

---

## Task lifecycle

```
                            ┌──── completed ──── [delivery]
                            │
queued ──── claim_next ──── in_progress
                            │
                            └──── cancelled

queued ──── [time elapsed] ──── expired
```

---

## Delivery (optional)

Most users won't need this. But if you want results pushed outside of Claude:

**Email** -- Formatted HTML via [Resend](https://resend.com). Set `RESEND_API_KEY`.

**Webhook** -- POST to any URL with the full task payload.

Pass `delivery_email` or `delivery_webhook` when queuing. Both optional, both independent.

---

## Worker (agent side)

The worker is bundled in the same package. No separate install.

### Quick start

```bash
# Check the queue
sleep-arbitrage-worker status

# Process all queued tasks
ANTHROPIC_API_KEY=sk-... sleep-arbitrage-worker drain

# Process one task and exit
ANTHROPIC_API_KEY=sk-... sleep-arbitrage-worker once
```

### How it works

1. Reads the same `tasks.json` the MCP server uses
2. Claims the highest-priority queued task (file lock prevents concurrent workers)
3. Sends task + context to Claude API
4. Writes the result back to `tasks.json`
5. Delivers via email (Resend) or webhook if configured
6. Repeats until the queue is empty (`drain` mode)

### Environment variables

| Variable | Required | Default | Description |
|:---------|:---------|:--------|:------------|
| `ANTHROPIC_API_KEY` | Yes | -- | Your Anthropic API key |
| `SLEEP_ARBITRAGE_DATA_FILE` | No | `./tasks.json` | Path to the shared task store |
| `SLEEP_ARBITRAGE_MODEL` | No | `claude-sonnet-4-6-20250514` | Model for task execution |
| `SLEEP_ARBITRAGE_MAX_TOKENS` | No | `4096` | Max response tokens |
| `RESEND_API_KEY` | No | -- | For email delivery via Resend |
| `SLEEP_ARBITRAGE_FROM_EMAIL` | No | `results@sleeparbitrage.com` | Sender address |

### Scheduling

**cron** (Linux/macOS):
```bash
# Every 30 minutes from 11pm to 7am
*/30 23,0-7 * * * ANTHROPIC_API_KEY=sk-... sleep-arbitrage-worker drain
```

**launchd** (macOS): See [`examples/launchd.plist`](examples/launchd.plist) for a ready-to-use template.

**systemd** (Linux):
```ini
# /etc/systemd/system/sleep-worker.timer
[Timer]
OnCalendar=*-*-* 23,00,01,02,03,04,05,06,07:00,30:00

[Install]
WantedBy=timers.target
```

### Customization

The worker uses a simple system prompt for general research/analysis tasks. To specialize it:

- **Swap the model**: Set `SLEEP_ARBITRAGE_MODEL` to any Anthropic model
- **Change the prompt**: Edit `SYSTEM_PROMPT` in `src/worker.ts`
- **Add tools**: Extend `executeTask()` with MCP clients, web search, file access, etc.
- **Use your own LLM**: Replace the Anthropic client with any API

### Python worker

A standalone Python worker (`worker.py`) is also included for environments where Node.js isn't available or you prefer Python. Same logic, same task store.

---

## Roadmap

| Phase | Status | What |
|:------|:-------|:-----|
| **1. Intake** | ✅ Shipped | Task queue, 5 MCP tools, JSON storage |
| **2. Delivery** | ✅ Shipped | Email + webhook on completion |
| **3. Agent Pickup** | ✅ Shipped | `claim_next`, priority, expiry |
| **4. Worker** | ✅ Shipped | Bundled TypeScript worker + Python fallback, scheduling templates |
| **5. Hosted Service** | Next | Web dashboard, agent fleet, SLA tiers |
| **6. Orchestration** | Future | Task chains, agent-to-agent handoff, SDK |

The self-hosted version stays free and open source forever. The hosted version is where the service lives.

---

<div align="center">

**Agents don't sleep. You do.**

Built by [NULL](https://x.com/nullbuilds) on [Model Context Protocol](https://modelcontextprotocol.io)

</div>
