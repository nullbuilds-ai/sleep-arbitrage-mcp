# sleep-arbitrage-mcp

An MCP server for async task handoff. Queue work before you sleep. Get results in the morning.

Built for [Sleep Arbitrage](https://nullbuilds.eth) -- the overnight agent fleet that works while you don't.

---

## What it does

You talk to Claude. You say "queue this for tonight." It's logged, timestamped, and ready for an agent to pick up and execute. When the work is done, the result gets delivered back to you via email or webhook.

Four tools. Local JSON storage. Automatic delivery on completion. No database required.

| Tool | What it does |
|------|-------------|
| `queue_task` | Submit a task with optional context, delivery email, and webhook URL |
| `list_tasks` | View all tasks, optionally filtered by status |
| `get_task` | Fetch full details by ID |
| `update_task` | Update status or attach a result. Automatically delivers via email/webhook on completion. |

---

## Install

```bash
npm install -g sleep-arbitrage-mcp
```

## Usage (Claude Desktop)

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "sleep-arbitrage": {
      "command": "sleep-arbitrage-mcp",
      "env": {
        "SLEEP_ARBITRAGE_DATA_FILE": "/path/to/tasks.json",
        "RESEND_API_KEY": "re_your_key_here",
        "SLEEP_ARBITRAGE_FROM_EMAIL": "results@yourdomain.com"
      }
    }
  }
}
```

### Environment variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `SLEEP_ARBITRAGE_DATA_FILE` | No | `./tasks.json` | Path to the JSON task store |
| `RESEND_API_KEY` | No | -- | [Resend](https://resend.com) API key for email delivery |
| `SLEEP_ARBITRAGE_FROM_EMAIL` | No | `results@sleeparbitrage.com` | Sender address for delivery emails |

Email delivery requires a Resend API key. Webhook delivery works without any configuration.

## Run from source

```bash
git clone https://github.com/nullbuilds-ai/sleep-arbitrage-mcp
cd sleep-arbitrage-mcp
npm install
npm run build
```

---

## Delivery

When a task is marked `completed` via `update_task`, results are automatically delivered through any channels configured at queue time:

**Email** -- A formatted email with the task description, context, and result. Powered by [Resend](https://resend.com).

**Webhook** -- A POST request to your URL with the full task payload:

```json
{
  "event": "task.completed",
  "task": {
    "id": "abc-123",
    "task": "Research competitor pricing",
    "status": "completed",
    "result": "Here's what I found...",
    "created_at": "2026-03-20T06:00:00Z",
    "updated_at": "2026-03-20T14:00:00Z"
  }
}
```

Both channels are optional and independent. Configure one, both, or neither per task.

---

## Task lifecycle

```
queued -> in_progress -> completed -> [email + webhook delivery]
                      -> cancelled
```

---

## Roadmap

### Phase 1 -- Intake (shipped)

Task queue with local JSON storage. Four MCP tools. Works today.

### Phase 2 -- Delivery (shipped)

Automatic email and webhook delivery when tasks complete. Resend for email, raw POST for webhooks.

### Phase 3 -- Auth + Multi-user

Right now it's local, single-user. Phase 3 makes it shareable.

- API key authentication
- Per-user task namespacing
- Read-only vs. write access tokens
- Team queues (multiple users, one queue)

### Phase 4 -- Hosted Service

The self-hosted version stays free and open source. The hosted version is Sleep Arbitrage.

- Cloud-hosted queue, no local setup
- Web dashboard to view and manage tasks
- Agent fleet on the backend -- tasks are actually executed, not just stored
- Guaranteed turnaround windows (overnight, 4-hour, 1-hour)
- Pricing: $500-2K/mo depending on volume and SLA

### Phase 5 -- Agent Orchestration Primitive

The longer play: this becomes infrastructure for multi-agent workflows.

- Agent-to-agent task handoff (one agent queues for another)
- Dependency chains (task B runs when task A completes)
- Priority queuing
- Execution history and audit log
- SDK for programmatic access

---

## Why this exists

Agents don't sleep. You do. The gap between when you stop working and when you need results is the opportunity.

This server is the front door to that. It's also a proof of concept for a new category: services that only make sense because agents exist.

---

## Built by

NULL (@nullbuilds) -- the public-facing agent fleet.

Built on [Model Context Protocol](https://modelcontextprotocol.io).
