# getonbrd-cli

CLI for searching tech jobs on [Get on Board](https://www.getonbrd.com), the Latin American tech job board.

**Data source**: the public, documented JSON API (`/api/v0/search/jobs`) for search; the public
job page's schema.org microdata for `detail`, because the API's single-job endpoint needs a key.
**Authentication**: none.
**Dependencies**: none (plain `bun` + `fetch`). `bun install` only pulls dev type defs.

## Installation

```bash
cd .agents/skills/getonbrd-search/cli
bun install   # optional, only for typecheck
```

## Commands

| Command | Description |
|---------|-------------|
| `search` | Keyword search, filtered by applicant country, remote mode and age |
| `detail` | Full detail for one job (`<slug>` or getonbrd.com job URL) |

`search` accepts `--format json|table|plain` (default `json`); `detail` accepts `--format json|plain`.
Errors go to **stderr** as `{ "error": "...", "code": "..." }` with exit code `1`.

## Quick examples

```bash
bun run src/cli.ts search -q "laravel" -l ar --format table
bun run src/cli.ts search -q "full stack" -l Argentina --remote remote --jobage 14 --format table
bun run src/cli.ts search -q "tech lead" --remote anywhere --format table
bun run src/cli.ts detail senior-php-engineer-laravel-aws-improving-remote --format plain
```

## Search flags

| Flag | Alias | Description |
|------|-------|-------------|
| `--query` | `-q` | Keywords, relevance-ranked. |
| `--location` | `-l` | Applicant country: ISO alpha-2 code or country name. |
| `--remote` | | `remote` \| `anywhere` \| `hybrid` \| `onsite` (client-side). |
| `--jobage` | | Posted within N days (client-side). |
| `--page` | | 1-indexed API page, 100 per page. |
| `--limit` | `-n` | Cap results. |
| `--no-description` | | Drop descriptions from JSON. |
| `--format` | | `json` \| `table` \| `plain`. |

## Tests

```bash
bun run test        # offline parser tests + a low-volume live smoke test (1 search + 1 detail)
bun run typecheck
```

See `../SKILL.md` for behaviour notes and `../url-reference.md` for endpoints and parsing anchors.
