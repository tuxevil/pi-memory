# pi-memory

Persistent memory extension for [pi](https://github.com/mariozechner/pi-coding-agent). Learns corrections, preferences, and project patterns from sessions and injects them into future conversations.

## What it does

- **Remembers** — extracts preferences, project patterns, and corrections from conversations via LLM consolidation
- **Injects** — automatically adds relevant memory context into every new session's system prompt
- **Learns** — corrections like "use sed for daily notes, not echo >>" become permanent lessons
- **Complements session-search** — session-search finds *what you did*, pi-memory remembers *what you learned*

## Memory types

| Type | Key prefix | Example |
|------|-----------|---------|
| Preferences | `pref.*` | `pref.commit_style` → "conventional commits" |
| Project patterns | `project.*` | `project.rosie.di` → "Dagger dependency injection" |
| Tool preferences | `tool.*` | `tool.sed` → "use for daily note insertion" |
| User identity | `user.*` | `user.timezone` → "US/Pacific" |
| Lessons | (table) | "DON'T: use echo >> for vault notes, use sed" |

## Tools

| Tool | Description |
|------|-------------|
| `memory_search` | Search semantic memory by keyword |
| `memory_remember` | Manually store a fact or lesson |
| `memory_forget` | Delete a fact or lesson |
| `memory_lessons` | List learned corrections |
| `memory_stats` | Show memory statistics |

## Commands

| Command | Description |
|---------|-------------|
| `/memory-consolidate` | Manually trigger memory extraction from current session |

## Install

```bash
# Clone
git clone <repo-url> ~/scratch/pi-memory
cd ~/scratch/pi-memory
npm install

# Symlink into pi extensions
ln -sf ~/scratch/pi-memory ~/.pi/agent/extensions/pi-memory
```

## Storage

SQLite database at `~/.pi/memory/memory.db` (WAL mode).

## How it works

1. **`session_start`** — opens the SQLite store
2. **`before_agent_start`** — builds a `<memory>` context block from stored facts/lessons and appends to system prompt
3. **`agent_end`** — collects conversation messages
4. **`session_shutdown`** — runs LLM consolidation to extract new knowledge, then closes store

Consolidation uses `pi -p --print` to make a lightweight LLM call that extracts structured JSON from the conversation.
