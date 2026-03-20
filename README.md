# sleep-arbitrage-mcp

An MCP server for async task handoff. Queue work before you sleep. Get results in the morning.

Built for [Sleep Arbitrage](https://nullbuilds.eth) -- the overnight agent fleet that works while you don't.

---

## What it does

You talk to Claude. You say "queue this for tonight." It's logged, timestamped, and ready for an agent to pick up and execute overnight.

Next morning, you ask Claude "what finished?" and it tells you.

The MCP server is the inbox and the outbox. No dashboard, no email, no extra app. You're already in Claude. That's the interface.

Five tools. Local JSON storage. No database required.

| Tool | What it does |
|------|-------------|
| `queue_task` | Submit a task with priority, expiry, and optional delivery config |
| `claim_next` | Grab the next task from the queue (highest priority, oldest first) |
| `list_tasks` | View all tasks, optionally filtered by status |
| `get_task` | Fetch full details by ID |
| `update_task` | Mark done and attach results. Auto-delivers via email/webhook if configured. |

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
        "SLEEP_ARBITRAGE_DATA_FILE": "/path/to/tasks.json"
      }
    }
  }
}
```

`SLEEP_ARBITRAGE_DATA_FILE` defaults to `tasks.json` in the current working directory.

## Run from source

```bash
git clone https://github.com/nullbuilds-ai/sleep-arbitrage-mcp
cd sleep-arbitrage-mcp
npm install
npm run build
```

---

## How it works

**You, at 11pm:**
> "Queue a task: research the top 5 MCP hosting services with pricing. Focus on indie dev and small team tiers."

**Agent, at 3am:**
> Calls `claim_next`, gets the highest-priority task, does the work, calls `update_task` with the result.

**You, at 7am:**
> "What finished overnight?"

That's it. No notifications to configure. No dashboard to check. You ask Claude, Claude asks the MCP server.

---

## Agent pickup

The `claim_next` tool is how agents work through the queue. It's atomic: grabs the next task and sets it to `in_progress` in one operation. No double-pickup, no race conditions.

Claim order: **urgent > normal > low**, then oldest first within each priority level.

An overnight agent loop looks like this:

```
1. claim_next          -> get a task
2. do the work
3. update_task         -> attach result, mark completed
4. repeat until claim_next returns empty
```

## Priority and expiry

Tasks have three priority levels: `urgent`, `normal` (default), and `low`.

Tasks can optionally expire. Pass `expires_in_hours` when queuing. Expired tasks are automatically marked `expired` and skipped by `claim_next`.

## Task lifecycle

```
queued -> [claimed via claim_next] -> in_progress -> completed -> [delivery]
                                                  -> cancelled
queued -> [expires_in_hours elapsed] -> expired
```

---

## Optional: Email + webhook delivery

For automated delivery outside of Claude (CI pipelines, team workflows, hosted service), tasks support optional email and webhook notifications on completion.

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `RESEND_API_KEY` | No | -- | [Resend](https://resend.com) API key for email delivery |
| `SLEEP_ARBITRAGE_FROM_EMAIL` | No | `results@sleeparbitrage.com` | Sender address for delivery emails |

Pass `delivery_email` or `delivery_webhook` when queuing a task. Both are optional. Most users won't need either.

---

## Roadmap

### Phase 1 -- Intake (shipped)

Task queue with local JSON storage. Four MCP tools.

### Phase 2 -- Delivery (shipped)

Optional email (Resend) and webhook delivery on task completion.

### Phase 3 -- Agent Pickup (shipped)

`claim_next` for agents to work through the queue. Priority levels. Task expiry. The overnight loop.

### Phase 4 -- Hosted Service

The self-hosted version stays free and open source. The hosted version is Sleep Arbitrage.

- Cloud-hosted queue, no local setup
- Web dashboard to view, schedule, and manage tasks
- Agent fleet on the backend -- tasks are actually executed, not just stored
- Guaranteed turnaround windows (overnight, 4-hour, 1-hour)
- Token/usage tracking

### Phase 5 -- Agent Orchestration Primitive

The longer play: this becomes infrastructure for multi-agent workflows.

- Agent-to-agent task handoff (one agent queues for another)
- Dependency chains (task B runs when task A completes)
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
