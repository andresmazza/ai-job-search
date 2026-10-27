#!/usr/bin/env bun
// Self-contained CLI for searching the job board of 5411 Hub (5411hub.com), a
// Buenos Aires tech recruiting agency. Zero runtime dependencies: plain bun +
// fetch + regex parsing of the public, robots-allowed /job-listing/ and
// /job-detail/ pages. Keep volume low.

import { runSearch, REMOTE_FLAG_VALUES, type RemoteMode, type SearchOpts } from "./commands/search.js"
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

const HELP = `5411hub-cli — search the 5411 Hub job board (Buenos Aires tech recruiting agency)

USAGE
  bun run src/cli.ts search [flags]
  bun run src/cli.ts detail <id|url> [--format json|plain]

SEARCH FLAGS
  --query, -q <text>      Keywords, searched by the site (title and description), e.g. "php".
  --location, -l <name>   Country, as the site's filter names it: "Argentina", "Colombia",
                          "United States", ... Includes LatAm-wide jobs open to that country.
  --remote <mode>         remote | hybrid | onsite (the site's job-type filter).
  --page <n>              1-indexed page (9 jobs per page, newest first).
  --limit, -n <n>         Cap results emitted (client-side).
  --format <fmt>          json (default) | table | plain.

  There is no --jobage: 5411 Hub publishes no posting dates (date is always null).

EXAMPLES
  bun run src/cli.ts search -q "php" --format table
  bun run src/cli.ts search -l Argentina --remote remote --format table
  bun run src/cli.ts search -q "engineer" -l Argentina --format table
  bun run src/cli.ts detail 105 --format plain
`

const KNOWN_FLAGS: Record<string, Set<string>> = {
  search: new Set(["query", "location", "remote", "page", "limit", "format", "help", "h"]),
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
      if (key === "jobage") {
        writeError(
          "--jobage is not supported: 5411 Hub publishes no posting dates, so a recency filter cannot be applied (results are newest first; use --page 1)",
          "UNKNOWN_FLAG",
        )
        return 1
      }
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
    for (const name of ["page", "limit"]) {
      if (flags[name] === undefined) continue
      const v = wholeNumber(flags[name])
      if (v === null) return badArg(`--${name} must be a whole number of at least 1, got "${flags[name]}"`)
      nums[name] = v
    }

    const opts: SearchOpts = {
      query: typeof flags.query === "string" ? flags.query.trim() : undefined,
      location: typeof flags.location === "string" ? flags.location.trim() : undefined,
      remote,
      page: nums.page ?? 1,
      limit: nums.limit,
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
