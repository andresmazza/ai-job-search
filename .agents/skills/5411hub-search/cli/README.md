# 5411hub-cli

CLI for searching the job board of [5411 Hub](https://5411hub.com/job-listing/), a Buenos Aires tech recruiting agency.

**Data source**: the public `/job-listing/` page (the site's own search/filter form) and
`/job-detail/<slug>-<id>/` pages, parsed as HTML.
**Authentication**: none.
**Dependencies**: none (plain `bun` + `fetch`). `bun install` only pulls dev type defs.

## Installation

```bash
cd .agents/skills/5411hub-search/cli
bun install   # optional, only for typecheck
```

## Commands

| Command | Description |
|---------|-------------|
| `search` | Keyword search with country and job-type filters, 9 per page, newest first |
| `detail` | Full detail for one job (`<id>` or 5411hub.com/job-detail/ URL) |

`search` accepts `--format json|table|plain` (default `json`); `detail` accepts `--format json|plain`.
Errors go to **stderr** as `{ "error": "...", "code": "..." }` with exit code `1`.

## Quick examples

```bash
bun run src/cli.ts search -q "php" --format table
bun run src/cli.ts search -l Argentina --remote remote --format table
bun run src/cli.ts detail 105 --format plain
```

## Search flags

| Flag | Alias | Description |
|------|-------|-------------|
| `--query` | `-q` | Keywords (title + description), phrase-like. |
| `--location` | `-l` | Country name from the site's filter. |
| `--remote` | | `remote` \| `hybrid` \| `onsite`. |
| `--page` | | 1-indexed, 9 per page. |
| `--limit` | `-n` | Cap results. |
| `--format` | | `json` \| `table` \| `plain`. |

There is no `--jobage`: the site publishes no posting dates (`date` is always `null`).

## Tests

```bash
bun run test        # offline parser tests + a low-volume live smoke test (1 search + 1 detail)
bun run typecheck
```

See `../SKILL.md` for behaviour notes and `../url-reference.md` for endpoints and parsing anchors.
