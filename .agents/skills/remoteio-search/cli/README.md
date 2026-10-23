# remoteio-cli

CLI for searching remote jobs on [Remote.io](https://remote.io), a worldwide remote-jobs board.

**Data source**: the public job sitemap (`sitemap-active-jobs.xml`) for search, and each
job page's schema.org `JobPosting` JSON-LD for details. Remote.io's `/api/` endpoints are
robots-disallowed and Turnstile-protected, and are never called.
**Authentication**: none.
**Dependencies**: none (plain `bun` + `fetch`). `bun install` only pulls dev type defs.

## Installation

```bash
cd .agents/skills/remoteio-search/cli
bun install   # optional, only for typecheck
```

## Commands

| Command | Description |
|---------|-------------|
| `search` | Match job titles in the sitemap, then enrich each hit from its job page |
| `detail` | Full detail for one job (`<id>` or remote.io job URL) |

`search` accepts `--format json|table|plain` (default `json`); `detail` accepts `--format json|plain`.
Errors go to **stderr** as `{ "error": "...", "code": "..." }` with exit code `1`.

## Quick examples

```bash
bun run src/cli.ts search -q "full stack" --format table
bun run src/cli.ts search -q "backend" -l latam --format table
bun run src/cli.ts search -c software-development -q "engineer" -l argentina --jobage 7
bun run src/cli.ts detail 2093363 --format plain
```

## Search flags

| Flag | Alias | Description |
|------|-------|-------------|
| `--query` | `-q` | Title/company words; all must match. Descriptions are not searched. |
| `--location` | `-l` | Applicant-location substring, or `latam` / `worldwide`. Post-filter, up to 60 page fetches. |
| `--category` | `-c` | Category slug, e.g. `software-development`. |
| `--jobage` | | Posted within N days. |
| `--page` | | 1-indexed, 20 per page. |
| `--limit` | `-n` | Cap results (and page fetches). |
| `--no-enrich` | | One request only; location `null`, company from slug. |
| `--format` | | `json` \| `table` \| `plain`. |

## Tests

```bash
bun run test        # offline parser tests + a 2-result live smoke test
bun run typecheck
```

See `../SKILL.md` for behaviour notes and `../url-reference.md` for parsing anchors.
