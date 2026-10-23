---
name: remoteio-search
version: 1.0.0
description: >
  Search remote job listings on Remote.io (remote.io), a worldwide remote-jobs
  board in English, or fetch the full detail of a Remote.io posting. Use when the
  user wants remote jobs from Remote.io, remote roles open to Argentina / LATAM /
  worldwide, or pastes a remote.io/remote-jobs/... link. Trigger phrases: Remote.io,
  remote.io jobs, remote jobs, work from home jobs, remote developer jobs, remote
  jobs LATAM, trabajo remoto, empleo remoto, búsqueda de empleo remoto, ofertas
  remotas, vacantes remotas.
context: fork
enabled: true  # set to false to keep this portal installed but have /scrape skip it
allowed-tools: Bash(bun run .agents/skills/remoteio-search/cli/src/cli.ts *)
---

# Remote.io Search Skill

Search active remote job listings on [Remote.io](https://remote.io), a global
remote-jobs board (about 4,900 active postings, 1,000+ in software development).
No authentication, no API key, **zero runtime dependencies**: it runs with just `bun`.

## How it gets data (read this once)

Remote.io is a JavaScript app. Its search API sits under `/api/`, which robots.txt
disallows and Cloudflare Turnstile protects, so **this skill does not use it**. It
reads only public, robots-allowed pages:

1. **Search** downloads the public job sitemap (`sitemap-active-jobs.xml`, ~1 MB,
   one request) and matches your query against each job's **URL slug** (title words
   plus company).
2. Each match's **job page** is then fetched (one request per result) to read its
   schema.org `JobPosting` data: real title, company, applicant location, post date
   and salary.

Consequences:
- **Title-only search.** `-q "full stack"` works; `-q "php"` or `-q "laravel"` only
  finds jobs whose *title* says so (almost none). Search by role (`full stack`,
  `backend`, `engineer`), then read descriptions with `detail`.
- **`--location` is a post-filter** on the job page's location, so it costs up to
  60 page fetches per search (capped, with a warning). Pair it with `--query` and/or
  `--category` to keep it cheap.
- Keep volume low: a handful of searches per session, not a crawl.

## Commands

### Search job listings

```bash
bun run .agents/skills/remoteio-search/cli/src/cli.ts search [flags]
```

- `--query <text>` / `-q <text>`: title keywords; every word must appear (whole words, case-insensitive, hyphens ignored).
- `--location <text>` / `-l <text>`: applicant-location filter, a case-insensitive substring (`Argentina`, `Europe`, `United States`) or an alias: `latam` (any Latin American country, or "LATAM"/"Americas" in the title) or `worldwide` (no location restriction listed).
- `--category <slug>` / `-c <slug>`: Remote.io category, e.g. `software-development`, `devops-sysadmin`, `data`, `product`, `design`, `quality-assurance`.
- `--jobage <days>`: posted within N days (sitemap date, then the page's `datePosted`).
- `--page <n>`: 1-indexed, 20 per page (with `--location`, pages are over the filtered results).
- `--limit <n>` / `-n <n>`: cap results emitted; also caps page fetches.
- `--no-enrich`: skip job-page fetches (1 request total). Company/title come from the slug, `location` is `null`. Cannot combine with `--location`.
- `--format json|table|plain`: default `json`.

### Fetch full job detail

```bash
bun run .agents/skills/remoteio-search/cli/src/cli.ts detail <id|url> [--format json|plain]
```

`id` is the numeric id from `search` (e.g. `2093363`), or pass a full
`https://remote.io/remote-jobs/<category>/<slug>-<id>` URL (skips the sitemap lookup).
Returns title, company, location, salary, employment type, posted / valid-through
dates, an ACTIVE/EXPIRED status, and the full description as text.

## Usage examples

```bash
# Full-stack roles, newest first
bun run .agents/skills/remoteio-search/cli/src/cli.ts search -q "full stack" --format table

# Backend roles open to Latin America (Argentina, Brazil, Mexico, ...)
bun run .agents/skills/remoteio-search/cli/src/cli.ts search -q "backend" -l latam --format table

# Software-development roles open to Argentina, posted in the last 7 days
bun run .agents/skills/remoteio-search/cli/src/cli.ts search -c software-development -q "engineer" -l argentina --jobage 7 --format table

# Senior roles with no location restriction
bun run .agents/skills/remoteio-search/cli/src/cli.ts search -q "senior engineer" -l worldwide --format table

# Quick, single-request scan of tech-lead titles
bun run .agents/skills/remoteio-search/cli/src/cli.ts search -q "tech lead" --no-enrich --format table

# Full details for one job
bun run .agents/skills/remoteio-search/cli/src/cli.ts detail 2093363 --format plain
```

## Output formats

| Format | Best for |
|--------|----------|
| `json` | Default: programmatic use, passing IDs to `detail` |
| `table` | Quick human-readable scanning |
| `plain` | Reading a single job's full detail (`detail` command) |

Search JSON: `{ "meta": { "count", "page", "pageSize", "totalMatches", "totalPages", "scanned", "scanTruncated" }, "results": [ { "id", "title", "company", "location", "date", "url", "category", "salary" } ] }`. Missing values are `null`.

All errors are written to **stderr** as `{ "error": "...", "code": "..." }` and the process exits with code `1`.

## Notes

- `location` is the posting's **applicant location requirement** (who may apply),
  e.g. `United States` or `Argentina; Colombia`. `Remote (no location restriction listed)`
  means the posting names none. That is not a promise it is open worldwide (US
  clearance roles show up this way too), so read the description.
- Dates: `date` is the JSON-LD `datePosted` (ISO timestamp). With `--no-enrich` it
  is the sitemap `lastmod` (date only, sometimes a day earlier).
- Results are sorted newest first by sitemap date.
- Apply links are not in the structured data; use the `url` (the Remote.io page
  links to the employer's application).
- `detail <id>` looks the id up in the active sitemap, then in the expired-job
  sitemaps. Passing the URL is faster.
- Job pages for removed postings return HTTP 410; the CLI reports `NOT_FOUND`.
