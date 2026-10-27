#!/usr/bin/env bun
// Self-contained CLI for searching tech jobs on Get on Board (getonbrd.com),
// the Latin American tech job board. Zero runtime dependencies: plain bun +
// fetch + JSON/regex parsing. Search uses Get on Board's public, documented,
// unauthenticated JSON API; detail reads the public job page.

import { runSearch, toCountryCode, REMOTE_FLAG_VALUES, type RemoteMode, type SearchOpts } from "./commands/search.js"
import { runDetail, type DetailOpts } from "./commands/detail.js"
import { writeError } from "./helpers.js"

interface Flags {
  _: string[]
  [k: string]: string | boolean | string[]
}

function parseFlags(argv: string[]): Flags {
  const flags: Flags = { _: [] }
  const alias: Record<string, string> = { q: "query", l: "location", n: "limit" }
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

const HELP = `getonbrd-cli — search tech jobs on Get on Board (Latin America)

USAGE
  bun run src/cli.ts search [flags]
  bun run src/cli.ts detail <slug|url> [--format json|plain]

SEARCH FLAGS
  --query, -q <text>      Keywords (title, skill, stack), e.g. "laravel", "tech lead".
  --location, -l <c>      Country the applicant lives in: ISO alpha-2 code ("ar", "mx")
                          or a country name ("Argentina", "Chile"). Returns on-site/hybrid
                          jobs there AND remote jobs open to that country.
  --remote <mode>         remote (any remote, incl. country-restricted) | anywhere
                          (remote from any country) | hybrid | onsite. Client-side filter.
  --jobage <days>         Posted within N days. Client-side filter.
  --page <n>              1-indexed API page (100 results per page, relevance-ranked).
  --limit, -n <n>         Cap results emitted (client-side).
  --no-description        Drop the full description from JSON output (cheap scan).
  --format <fmt>          json (default) | table | plain.

EXAMPLES
  bun run src/cli.ts search -q "laravel" -l ar --format table
  bun run src/cli.ts search -q "full stack" -l Argentina --remote remote --jobage 14 --format table
  bun run src/cli.ts search -q "tech lead" --remote anywhere --format table
  bun run src/cli.ts search -q "devsecops" -l cl --remote hybrid --format table
  bun run src/cli.ts detail senior-php-engineer-laravel-aws-improving-remote --format plain
`

const KNOWN_FLAGS: Record<string, Set<string>> = {
  search: new Set(["query", "location", "remote", "jobage", "page", "limit", "no-description", "format", "help", "h"]),
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
    for (const name of ["query", "location", "remote"]) {
      if (flags[name] !== undefined && (typeof flags[name] !== "string" || !(flags[name] as string).trim())) {
        return badArg(`--${name} requires a non-empty value`)
      }
    }
    if (flags["no-description"] !== undefined && flags["no-description"] !== true) {
      return badArg("--no-description takes no value")
    }

    let countryCode: string | undefined
    if (typeof flags.location === "string") {
      const code = toCountryCode(flags.location)
      if (!code) {
        return badArg(
          `--location must be an ISO 3166-1 alpha-2 country code (e.g. "ar") or a known country name, got "${flags.location}". Cities are not supported by the API.`,
        )
      }
      countryCode = code
    }

    let remote: RemoteMode | undefined
    if (typeof flags.remote === "string") {
      const v = flags.remote.trim().toLowerCase().replace("on-site", "onsite")
      if (!REMOTE_FLAG_VALUES.includes(v as RemoteMode)) {
        return badArg(`--remote must be one of ${REMOTE_FLAG_VALUES.join("|")}, got "${flags.remote}"`)
      }
      remote = v as RemoteMode
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
      query: typeof flags.query === "string" ? flags.query.trim() : undefined,
      countryCode,
      remote,
      jobage: nums.jobage,
      page: nums.page ?? 1,
      limit: nums.limit,
      includeDescription: !flags["no-description"],
      format: fmt as SearchOpts["format"],
    }
    return runSearch(opts)
  }

  if (cmd === "detail") {
    const id = (flags._ as string[])[1]
    if (!id) {
      writeError("detail requires a <slug|url>", "NO_ID")
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
