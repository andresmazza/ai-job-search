---
name: howdy-search
version: 1.0.0
description: >
  Search Howdy.com's public careers board (howdylatam.com/careers) for remote and
  hybrid roles with US companies, open to talent living in Latin America
  (Argentina, Brazil, Chile, Colombia, Mexico, Peru, Uruguay). Use when the user
  wants Howdy jobs, LatAm remote jobs for US companies, or the full description of
  a Howdy posting. Trigger phrases: Howdy jobs, Howdy careers, remote jobs from
  Latin America, LatAm remote jobs, US company remote from Argentina; in Spanish:
  ofertas de trabajo, búsqueda de empleo, trabajo remoto, empleos remotos para
  empresas de EE.UU., vacantes; in Portuguese: vagas de emprego, trabalho remoto.
context: fork
enabled: true  # set to false to keep this portal installed but have /scrape skip it
allowed-tools: Bash(bun run .agents/skills/howdy-search/cli/src/cli.ts *)
---

# Howdy Search Skill

Search the open roles on **Howdy.com's careers board** (`https://www.howdylatam.com/careers`).
Howdy is a staffing company that employs engineers and other professionals in Latin America
and places them full-time with US companies. The board is public: no login, no API key,
and **zero runtime dependencies** (runs with just `bun`). `robots.txt` allows the
`/careers` paths.

The board is small (about 25 open roles as of 2026-10-22) and returns every job in one
page, so `search` fetches it once and filters locally.

## When to use this skill

- List or filter Howdy's open roles by keyword, candidate country, or remote/hybrid
- Find roles posted recently (`--jobage`)
- Read the full description, requirements, skills and benefits of one posting

## Commands

### Search job listings

```bash
bun run .agents/skills/howdy-search/cli/src/cli.ts search [flags]
```

- `--query <text>` / `-q <text>`: keywords. **Every** term must appear in the job title, category, or skill tags (case- and accent-insensitive). Omit to list every open job.
- `--location <country>` / `-l <country>`: the country the candidate lives in, e.g. `Argentina`, `Mexico`, `Brazil`. Matches the posting's list of eligible countries. City names do not work; Howdy lists countries.
- `--remote <mode>`: `remote` or `hybrid`.
- `--jobage <days>`: posted within N days. The listing has no dates, so this fetches each matching job's page to read its date. Combine it with `--query` to keep the number of requests down.
- `--page <n>`: 1-indexed, 20 results per page (client-side).
- `--limit <n>` / `-n <n>`: cap the results emitted.
- `--format json|table|plain`: default `json`.

### Fetch full job detail

```bash
bun run .agents/skills/howdy-search/cli/src/cli.ts detail <id|slug|url> [--format json|plain]
```

Accepts the `id` from search results (e.g. `a1ZTQ00000xUzX72AK`), the URL slug
(`mid-security-engineer-a1ztq00000xuzx72ak`), or a full `howdylatam.com/careers/...` URL
(including `/es/` and `/pt/` variants). Returns the description, posting date, seniority,
years of experience, skills, eligible countries, office hubs, and benefits.

## Usage examples

```bash
# Everything open right now
bun run .agents/skills/howdy-search/cli/src/cli.ts search --format table

# React roles open to candidates in Argentina
bun run .agents/skills/howdy-search/cli/src/cli.ts search -q "react" -l "Argentina" --format table

# Security roles posted in the last 60 days
bun run .agents/skills/howdy-search/cli/src/cli.ts search -q "security" --jobage 60 --format table

# Backend Node.js roles, fully remote
bun run .agents/skills/howdy-search/cli/src/cli.ts search -q "backend node" --remote remote --format table

# Hybrid roles for candidates in Mexico (e.g. Guadalajara hub)
bun run .agents/skills/howdy-search/cli/src/cli.ts search -l "Mexico" --remote hybrid --format table

# Full detail for one posting
bun run .agents/skills/howdy-search/cli/src/cli.ts detail a1ZTQ00000xUzX72AK --format plain
```

## Output formats

| Format | Best for |
|--------|----------|
| `json` | Default: programmatic use, passing IDs to `detail` |
| `table` | Quick human-readable scanning |
| `plain` | Reading a single job's full detail (`detail` command) |

Search results carry `id`, `title`, `company`, `location`, `date`, `url`, plus `category`,
`workingHours`, `workplace`, `countries`, and `skills`. All errors are written to
**stderr** as `{ "error": "...", "code": "..." }` with exit code `1`.

## Notes

- **`company` is always `Howdy.com`.** Howdy is the employer of record, and the US client company is not named on the board.
- **`date` is `null` in search results unless `--jobage` is passed.** The date comes from each posting's detail page. A job whose date can't be read is kept rather than dropped.
- **Some postings are evergreen talent-pool roles.** Several generic roles (e.g. "Backend Node.js Developer", "Fullstack Node.js & React.js Developer") share a 2025-04-02 posting date and stay open to build a candidate pool. `--jobage` filters them out.
- **Postings are in English.** The `/es/` and `/pt/` versions of the site show the same jobs.
- **Applications happen on the posting page itself** (an on-page form). `detail` returns that page as `applyUrl`.
- **`www.howdy.com` is a different site.** It is Howdy's marketing site for companies and returned HTTP 429 to the CLI's User-Agent during setup. The careers board on `howdylatam.com` was not rate-limited.
- Job ids are Salesforce record ids (18 characters, case-sensitive in the JSON, lowercased in URLs). `detail` matches them case-insensitively.
