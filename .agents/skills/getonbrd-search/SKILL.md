---
name: getonbrd-search
version: 1.0.0
description: >
  Search tech job listings on Get on Board (getonbrd.com), the Latin American tech
  job board (Chile, Argentina, Mexico, Colombia, Peru, and remote roles open to
  LatAm), or fetch the full detail of a Get on Board posting. Use when the user
  wants Get on Board jobs, LatAm developer jobs, remote tech roles open to
  Argentina / LATAM, or pastes a getonbrd.com/jobs/... link. Trigger phrases:
  Get on Board, getonbrd, LatAm tech jobs, remote developer jobs Latin America,
  software jobs Argentina; in Spanish: ofertas de trabajo tech, empleos de
  programación, búsqueda de empleo, trabajo remoto, vacantes de desarrollador,
  empleos en Argentina / Chile; in Portuguese: vagas de tecnologia, trabalho remoto.
context: fork
enabled: true  # set to false to keep this portal installed but have /scrape skip it
allowed-tools: Bash(bun run .agents/skills/getonbrd-search/cli/src/cli.ts *)
---

# Get on Board Search Skill

Search open tech jobs on **[Get on Board](https://www.getonbrd.com)**, a Chile-based job
board for programming, data, design, DevOps and other tech roles across Latin America,
including many remote roles restricted to LatAm countries. No authentication, no API key,
and **zero runtime dependencies** (just `bun`).

## How it gets data

- **search** calls Get on Board's public, documented JSON API
  (`GET /api/v0/search/jobs`, see [the API reference](https://www.getonbrd.com/api-doc.html)).
  It needs no key, and each result already contains the **full posting text**, so you
  don't need a `detail` call per hit to read requirements.
- **detail** reads the public job page (`/jobs/<slug>`). The API's single-job endpoint
  requires an API key, so detail parses the page's schema.org microdata instead.
- `robots.txt` has no Disallow rules. Keep volume low anyway: a handful of searches per
  session.

## Commands

### Search job listings

```bash
bun run .agents/skills/getonbrd-search/cli/src/cli.ts search [flags]
```

- `--query <text>` / `-q <text>`: keywords (title, skill, stack). Full-text, relevance-ranked.
- `--location <c>` / `-l <c>`: the country the applicant lives in, as an ISO alpha-2 code
  (`ar`, `cl`, `mx`) or a country name (`Argentina`, `Chile`, `México`). Returns on-site
  and hybrid jobs in that country **plus remote jobs open to it**. Cities are not
  supported: the API filters by country only.
- `--remote <mode>`: `remote` (any remote, including country-restricted "remote_local"),
  `anywhere` (remote from any country), `hybrid`, or `onsite`. Filtered client-side.
- `--jobage <days>`: posted within N days. Filtered client-side on `published_at`.
- `--page <n>`: 1-indexed API page, 100 results per page.
- `--limit <n>` / `-n <n>`: cap results emitted (client-side).
- `--no-description`: drop the full description from JSON output (cheap discovery pass).
- `--format json|table|plain`: default `json`.

### Fetch full job detail

```bash
bun run .agents/skills/getonbrd-search/cli/src/cli.ts detail <slug|url> [--format json|plain]
```

Accepts the `id` from search (the job slug, e.g. `senior-php-engineer-laravel-aws-improving-remote`)
or a `getonbrd.com/jobs/...` URL, including `/jobs/<category>/<slug>` and `/empleos/...`.
Returns the title, company, header location, posting date, seniority, salary, remote
policy, eligible countries, skills, apply-language note, `isActive`, and the description
as text.

## Usage examples

```bash
# Laravel roles open to someone living in Argentina (on-site/hybrid there, or remote)
bun run .agents/skills/getonbrd-search/cli/src/cli.ts search -q "laravel" -l ar --format table

# Full-stack roles, remote, open to Argentina, posted in the last 14 days
bun run .agents/skills/getonbrd-search/cli/src/cli.ts search -q "full stack" -l Argentina --remote remote --jobage 14 --format table

# Tech-lead roles you can do from any country
bun run .agents/skills/getonbrd-search/cli/src/cli.ts search -q "tech lead" --remote anywhere --format table

# Security roles in Chile, hybrid
bun run .agents/skills/getonbrd-search/cli/src/cli.ts search -q "security" -l cl --remote hybrid --format table

# Full detail for one posting
bun run .agents/skills/getonbrd-search/cli/src/cli.ts detail senior-php-engineer-laravel-aws-improving-remote --format plain
```

## Output formats

| Format | Best for |
|--------|----------|
| `json` | Default: programmatic use; the only search format carrying descriptions |
| `table` | Quick human-readable scanning (ID column is never truncated) |
| `plain` | Reading a single job's full detail (`detail` command) |

Search JSON: `{ "meta": { "count", "page", "pageSize", "totalPages", "scanned" }, "results": [...] }`.
Each result has `id`, `title`, `company`, `location`, `date`, `url`, plus `remoteModality`,
`countries`, `regions` (remote eligibility is countries + regions combined), `seniority`, `employmentType`, `category`, `salary`, `lang`, `applications`,
and `description`. Missing values are `null`. All errors go to **stderr** as
`{ "error": "...", "code": "..." }` with exit code `1`.

## Notes

- **Search is relevance-ranked, not newest-first.** `--jobage` and `--remote` filter
  the fetched page (100 jobs), so a narrow query rarely needs `--page 2`. A broad query
  may need it.
- **`remoteModality`** values: `fully_remote` (anywhere), `remote_local` (remote, but the
  applicant must live in the listed countries/regions), `temporarily_remote`, `hybrid`,
  `no_remote`. The `location` string shows the eligible countries, e.g.
  `Remote (South America, Central America, Mexico)`: regions and countries combined. Read it before assuming "remote" means worldwide.
- **The API refuses `country_code` together with `remote`** (HTTP 422). The CLI never
  sends `remote` and filters modality itself, so `-l ar --remote remote` works.
- **Salary** is published on many postings as gross **USD per month**
  (`USD 2100–2400/month`). Get on Board notes that it may be paid in local currency.
- **Apply language:** `detail` returns `applyNote`, e.g. "Requires applying in English".
  Search returns `lang` (`en`/`es`/`pt`, or `null` when unspecified).
- **Closed postings:** the page stays up with a "Closed job - No longer accepting
  applications" banner, and `detail` reports `isActive: false`. A reposted job often gets
  a new slug with a suffix (`...-santiago-bd8c`), and the old slug points at the
  closed one.
- **Dates:** search `date` is the API's `published_at` (latest publication). `detail`
  `date` is the page's `datePosted`.
- **Results are mostly Chile-based on-site/hybrid, plus a large remote LatAm segment.**
  Postings are in Spanish or English.
