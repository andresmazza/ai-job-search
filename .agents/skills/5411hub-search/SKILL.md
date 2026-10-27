---
name: 5411hub-search
version: 1.0.0
description: >
  Search the job board of 5411 Hub (5411hub.com), a Buenos Aires tech recruiting
  agency that places Argentine / LatAm talent with Argentine and US companies, or
  fetch the full detail of a 5411 Hub posting. Use when the user wants 5411 Hub
  jobs, recruiter-agency openings in Buenos Aires / CABA, or remote LatAm roles
  for US companies, or pastes a 5411hub.com/job-detail/... link. Trigger phrases:
  5411 Hub, 5411hub, Buenos Aires tech jobs, CABA jobs, LatAm remote jobs for US
  companies; in Spanish: búsquedas laborales, ofertas de trabajo, empleos en
  Buenos Aires, trabajo remoto, vacantes, búsqueda de empleo, empleos IT.
context: fork
enabled: true  # set to false to keep this portal installed but have /scrape skip it
allowed-tools: Bash(bun run .agents/skills/5411hub-search/cli/src/cli.ts *)
---

# 5411 Hub Search Skill

Search the open roles on **[5411 Hub's job board](https://5411hub.com/job-listing/)**.
5411 Hub is a tech recruiting agency in Palermo, Buenos Aires (with a US office in Florida).
It recruits for Argentine companies (often hybrid in CABA) and for US companies hiring
LatAm talent remotely. The board is small: about 100 open roles, across tech, finance,
marketing and operations. No authentication, no API key, **zero runtime dependencies**
(just `bun`).

## How it gets data

It reads two public HTML pages. `robots.txt` disallows nothing.

- **search**: `/job-listing/`, using the site's own filter form (keyword search, country,
  job type) and its pagination (9 jobs per page, newest first).
- **detail**: `/job-detail/<slug>-<id>/`. Only the numeric id matters.

The site's JSON API needs a login token and is not used. Keep volume low: a handful
of searches per session.

## Commands

### Search job listings

```bash
bun run .agents/skills/5411hub-search/cli/src/cli.ts search [flags]
```

- `--query <text>` / `-q <text>`: keywords. The site searches titles **and descriptions**.
  Multi-word queries behave like a phrase (`"full stack"` can return nothing while
  `"php"` finds the PHP roles), so prefer one strong keyword.
- `--location <name>` / `-l <name>`: country as the site's filter names it (`Argentina`,
  `Colombia`, `United States`, ...). Includes LatAm-wide roles open to that country.
  Cities are not filter options.
- `--remote <mode>`: `remote`, `hybrid`, or `onsite` (the site's job-type filter).
- `--page <n>`: 1-indexed, 9 jobs per page.
- `--limit <n>` / `-n <n>`: cap results emitted (client-side).
- `--format json|table|plain`: default `json`.
- **No `--jobage`:** 5411 Hub publishes no posting dates (see Notes). Passing it exits 1.

### Fetch full job detail

```bash
bun run .agents/skills/5411hub-search/cli/src/cli.ts detail <id|url> [--format json|plain]
```

Accepts the numeric `id` from search (e.g. `105`) or a `5411hub.com/job-detail/...` URL.
Returns the title, location, job type, languages, skills, category and the full
description as text.

## Usage examples

```bash
# PHP / Laravel roles
bun run .agents/skills/5411hub-search/cli/src/cli.ts search -q "php" --format table

# Remote roles open to someone living in Argentina
bun run .agents/skills/5411hub-search/cli/src/cli.ts search -l Argentina --remote remote --format table

# Hybrid roles in Argentina (mostly CABA)
bun run .agents/skills/5411hub-search/cli/src/cli.ts search -l Argentina --remote hybrid --format table

# Engineering roles, newest first, second page
bun run .agents/skills/5411hub-search/cli/src/cli.ts search -q "engineer" --page 2 --format table

# Full detail for one posting
bun run .agents/skills/5411hub-search/cli/src/cli.ts detail 105 --format plain
```

## Output formats

| Format | Best for |
|--------|----------|
| `json` | Default: programmatic use, passing ids to `detail` |
| `table` | Quick human-readable scanning |
| `plain` | Reading a single job's full detail (`detail` command) |

Search JSON: `{ "meta": { "count", "page", "pageSize", "totalPages" }, "results": [...] }`.
Each result has `id`, `title`, `company`, `location`, `date`, `url`, plus `skills`,
`categories`, `jobType` (e.g. `["Contractor", "Full Time", "Remote"]`) and `languages`
(e.g. `["English (Advanced)"]`). Missing values are `null` or `[]`. All errors go to
**stderr** as `{ "error": "...", "code": "..." }` with exit code `1`.

## Notes

- **`date` is always `null`.** Neither the listing, the detail page, nor any public
  endpoint carries a publication date. Results are ordered newest first (ids are
  sequential), so page 1 is the freshest. Some low-id postings may be old but still
  listed; check with the recruiter before investing time.
- **`company` is always `5411 Hub`.** The agency is the recruiter of record and usually
  describes the client ("una Fintech líder", "una empresa internacional de tecnología")
  without naming it.
- **`languages`** lists the required level, e.g. `English (Advanced)`. Compare it with your
  own level. Many US-client roles require advanced or native English.
- **`jobType`** mixes contract and workplace terms: `Contractor` / `Direct Hiring`,
  `Full Time` / `Part Time`, `Remote` / `Hybrid` / `On-Site`.
- **Postings are mostly in Spanish**, some in English.
- **Out-of-range `--page`** returns an empty list. The site itself would serve the last
  page again.
