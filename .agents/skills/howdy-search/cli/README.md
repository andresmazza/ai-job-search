# howdy-cli

CLI for Howdy.com's public careers board (`https://www.howdylatam.com/careers`): remote and hybrid
roles with US companies, open to talent living in Latin America.

**Data source**: the careers listing page (jobs embedded in its Next.js RSC payload) and each posting's
schema.org `JobPosting` JSON-LD.
**Authentication**: none.
**Dependencies**: none (plain `bun` + `fetch` + regex/JSON parsing). `bun install` only pulls dev type definitions.

## Installation

```bash
cd .agents/skills/howdy-search/cli
bun install   # optional, only installs TypeScript dev types
```

## Commands

| Command | Description |
|---------|-------------|
| `search` | List open jobs, filtered client-side by `--query`, `--location` (country), `--remote`, `--jobage` |
| `detail` | Full detail for one posting (id, slug, or howdylatam.com URL) |

`search` accepts `--format json|table|plain` (default `json`). `detail` accepts `--format json|plain`.
Errors go to **stderr** as `{ "error": "...", "code": "..." }` with exit code `1`.

## Quick examples

```bash
bun run src/cli.ts search --format table
bun run src/cli.ts search -q "react" -l "Argentina" --format table
bun run src/cli.ts search -q "security" --jobage 60 --format table
bun run src/cli.ts detail a1ZTQ00000xUzX72AK --format plain
```

## Tests

```bash
bun run typecheck
bun run test   # parsing unit tests + live smoke tests (a handful of requests)
```

See `../url-reference.md` for the page structure to update if Howdy changes its markup.
