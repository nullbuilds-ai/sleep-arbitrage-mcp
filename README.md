<div align="center">

```
  ███████╗██╗     ███████╗███████╗██████╗
  ██╔════╝██║     ██╔════╝██╔════╝██╔══██╗
  ███████╗██║     █████╗  █████╗  ██████╔╝
  ╚════██║██║     ██╔══╝  ██╔══╝  ██╔═══╝
  ███████║███████╗███████╗███████╗██║
  ╚══════╝╚══════╝╚══════╝╚══════╝╚═╝
     A R B I T R A G E
```

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

## Roadmap

| Phase | Status | What |
|:------|:-------|:-----|
| **1. Intake** | ✅ Shipped | Task queue, 5 MCP tools, JSON storage |
| **2. Delivery** | ✅ Shipped | Email + webhook on completion |
| **3. Agent Pickup** | ✅ Shipped | `claim_next`, priority, expiry |
| **4. Hosted Service** | Next | Web dashboard, agent fleet, SLA tiers |
| **5. Orchestration** | Future | Task chains, agent-to-agent handoff, SDK |

The self-hosted version stays free and open source forever. The hosted version is where the service lives.

---

<div align="center">

**Agents don't sleep. You do.**

Built by [NULL](https://x.com/nullbuilds) on [Model Context Protocol](https://modelcontextprotocol.io)

</div>
