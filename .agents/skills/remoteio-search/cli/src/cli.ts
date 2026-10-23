#!/usr/bin/env bun
// Self-contained CLI for searching remote jobs on Remote.io. Zero runtime
// dependencies: plain bun + fetch + regex/JSON parsing.
//
// Uses only robots.txt-allowed public pages (the job sitemap and job pages).
// Remote.io's /api/ search endpoints are disallowed and Turnstile-protected;
// this CLI never calls them. Keep volume low.

import { runSearch, type SearchOpts } from "./commands/search.js"
import { runDetail, type DetailOpts } from "./commands/detail.js"
import { writeError } from "./helpers.js"

interface Flags {
  _: string[]
  [k: string]: string | boolean | string[]
}

function parseFlags(argv: string[]): Flags {
  const flags: Flags = { _: [] }
  const alias: Record<string, string> = { q: "query", l: "location", n: "limit", c: "category" }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a.startsWith("-")) {
      const key = alias[a.replace(/^-+/, "")] ?? a.replace(/^-+/, "")
      const next = argv[i + 1]
      if (next === undefined || next.startsWith("-")) {
        flags[key] = true
      } else {
        flags[key] = next
        i++
      }
    } else {
      ;(flags._ as string[]).push(a)
    }
  }
  return flags
}

const HELP = `remoteio-cli — search remote jobs on Remote.io (worldwide remote job board)

USAGE
  bun run src/cli.ts search [flags]
  bun run src/cli.ts detail <id|url> [--format json|plain]

SEARCH FLAGS
  --query, -q <text>      Keywords matched against the job TITLE (and company) words.
                          Every word must appear: "full stack" matches "Senior Full-Stack
                          Engineer". Descriptions are not searched ("php" finds only titles
                          that say PHP).
  --location, -l <text>   Filter by applicant location after fetching each job page:
                          a country/region substring ("Argentina", "Europe", "United States"),
                          or the aliases "latam" and "worldwide".
  --category, -c <slug>   Remote.io category slug, e.g. software-development, devops-sysadmin,
                          data, product, design, quality-assurance.
  --jobage <days>         Posted within N days. Default: all active postings.
  --page <n>              1-indexed page over the title matches (20 per page). Default 1.
  --limit, -n <n>         Cap results emitted (client-side).
  --no-enrich             Skip per-job page fetches: company/title come from the URL slug,
                          location is null. One request total. Conflicts with --location.
  --format <fmt>          json (default) | table | plain.

EXAMPLES
  bun run src/cli.ts search -q "full stack" --format table
  bun run src/cli.ts search -q "backend" -l latam --format table
  bun run src/cli.ts search -q "engineer" -c software-development -l worldwide --jobage 7
  bun run src/cli.ts detail 2093363 --format plain
`

const KNOWN_FLAGS: Record<string, Set<string>> = {
  search: new Set(["query", "location", "category", "jobage", "page", "limit", "no-enrich", "format", "help", "h"]),
  detail: new Set(["format", "help", "h"]),
}

function badArg(msg: string): number {
  writeError(msg, "BAD_ARG")
  return 1
}

/** Whole number >= 1, or null (Number(), not parseInt(), so "0.5" and "7x" are rejected). */
function wholeNumber(raw: string | boolean | string[]): number | null {
  const v = typeof raw === "string" ? Number(raw.trim()) : NaN
  return Number.isInteger(v) && v >= 1 ? v : null
}

async function main(): Promise<number> {
  const flags = parseFlags(process.argv.slice(2))
  const cmd = (flags._ as string[])[0]

  if (!cmd || flags.help || flags.h) {
    process.stdout.write(HELP)
    return cmd ? 0 : 1
  }

  // Reject unknown flags: a silently discarded filter changes what the search returns.
  const known = KNOWN_FLAGS[cmd]
  if (known) {
    for (const key of Object.keys(flags)) {
      if (key === "_" || known.has(key)) continue
      writeError(`unknown flag --${key} for '${cmd}'; see --help for the supported flags`, "UNKNOWN_FLAG")
      return 1
    }
  }

  if (cmd === "search") {
    for (const name of ["query", "location", "category"]) {
      if (flags[name] !== undefined && (typeof flags[name] !== "string" || !(flags[name] as string).trim())) {
        return badArg(`--${name} requires a non-empty value`)
      }
    }
    if (flags["no-enrich"] !== undefined && flags["no-enrich"] !== true) {
      return badArg("--no-enrich takes no value")
    }
    if (flags["no-enrich"] && flags.location) {
      return badArg("--location needs each job page's location data; it cannot be combined with --no-enrich")
    }
    const fmt = flags.format !== undefined ? String(flags.format) : "json"
    if (!["json", "table", "plain"].includes(fmt)) return badArg(`--format must be one of json|table|plain, got "${fmt}"`)

    const nums: Record<string, number | undefined> = {}
    for (const name of ["jobage", "page", "limit"]) {
      if (flags[name] === undefined) continue
      const v = wholeNumber(flags[name])
      if (v === null) return badArg(`--${name} must be a whole number of at least 1, got "${flags[name]}"`)
      nums[name] = v
    }

    const opts: SearchOpts = {
      query: flags.query as string | undefined,
      location: flags.location as string | undefined,
      category: flags.category as string | undefined,
      jobage: nums.jobage,
      page: nums.page ?? 1,
      limit: nums.limit,
      enrich: !flags["no-enrich"],
      format: fmt as SearchOpts["format"],
    }
    return runSearch(opts)
  }

  if (cmd === "detail") {
    const id = (flags._ as string[])[1]
    if (!id) {
      writeError("detail requires an <id|url>", "NO_ID")
      return 1
    }
    const fmt = flags.format !== undefined ? String(flags.format) : "json"
    if (!["json", "plain"].includes(fmt)) return badArg(`--format must be one of json|plain, got "${fmt}"`)
    const opts: DetailOpts = { id, format: fmt as DetailOpts["format"] }
    return runDetail(opts)
  }

  writeError(`Unknown command "${cmd}"`, "BAD_CMD")
  return 1
}

main()
  .then((code) => process.exit(code))
  .catch((e) => {
    writeError(e instanceof Error ? e.message : String(e), "INTERNAL_ERROR")
    process.exit(1)
  })
