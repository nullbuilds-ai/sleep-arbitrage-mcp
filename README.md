# sleep-arbitrage-mcp

An MCP server for async task handoff. Queue work before you sleep. Get results in the morning.

Built for [Sleep Arbitrage](https://nullbuilds.eth) -- the overnight agent fleet that works while you don't.

---

## What it does

You talk to Claude. You say "queue this for tonight." It's logged, timestamped, and ready for an agent to pick up and execute. When the work is done, the result comes back attached to the same task.

Four tools. Local JSON storage. No database required.

| Tool | What it does |
|------|-------------|
| `queue_task` | Submit a task with optional context and delivery email |
| `list_tasks` | View all tasks, optionally filtered by status |
| `get_task` | Fetch full details by ID |
| `update_task` | Update status or attach a result (used by agents) |

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
git clone https://github.com/nullbuilds/sleep-arbitrage-mcp
cd sleep-arbitrage-mcp
npm install
npm run build
```

---

## Task lifecycle

```
queued -> in_progress -> completed
                      -> cancelled
```

---

## Roadmap

This is Phase 1. The intake layer. It works. Here's where it goes.

### Phase 2 -- Delivery

Right now tasks sit in a file. Phase 2 makes them go somewhere.

- Email delivery when a task completes (SMTP or SendGrid)
- Webhook support for custom integrations
- Slack notification option
- Configurable per task at queue time

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
