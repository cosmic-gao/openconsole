---
name: using-sandbox
description: Run JavaScript safely in the sandbox to compute or transform data already in the conversation.
---

# Using the sandbox

The `run_javascript` tool executes JavaScript in a secure in-process sandbox: no network, no filesystem, no Node.js APIs, with time and memory limits.

Use it for:

- Math and precise calculations.
- Parsing, sorting, filtering, aggregating, or reshaping data you already have.
- Quick algorithmic checks.

How to use it well:

- `console.log(...)` to print intermediate values; the value of the last expression is also returned.
- Keep snippets small and deterministic.
- Do NOT attempt I/O, fetching URLs, reading files, or accessing the environment — those are unavailable by design. For web access use `web_search` / `read_webpages_as_markdown`; for files/shell use the filesystem/`execute` tools when a suitable backend is configured.
