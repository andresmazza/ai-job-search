import {
  LIST_URL,
  htmlFetch,
  parseJobList,
  parseJobDetail,
  matchesQuery,
  matchesLocation,
  writeError,
  type JobCard,
} from "../helpers.js"

export const PAGE_SIZE = 20

export interface SearchOpts {
  query?: string
  location?: string
  remote?: string // "remote" | "hybrid"
  jobage?: number
  page: number
  limit?: number
  format: "json" | "table" | "plain"
}

function renderTable(cards: JobCard[]): string {
  if (cards.length === 0) return "No results."
  const rows = cards.map((c) => {
    const title = (c.title || "").slice(0, 44).padEnd(44)
    const loc = (c.location || "—").slice(0, 40).padEnd(40)
    const date = c.date ? c.date.slice(0, 10) : "—"
    return `${c.id.padEnd(18)} ${title} ${loc} ${date}`
  })
  const header = "ID".padEnd(18) + " " + "TITLE".padEnd(44) + " " + "LOCATION".padEnd(40) + " DATE"
  return [header, "-".repeat(header.length), ...rows].join("\n")
}

/**
 * The listing carries no posting dates, so --jobage fetches each candidate's
 * detail page (sequentially, to stay polite) to read JSON-LD datePosted.
 * Only jobs that already passed the query/location/remote filters are fetched.
 */
async function fillDates(cards: JobCard[]): Promise<void> {
  for (const c of cards) {
    const html = await htmlFetch(c.url)
    if (!html) continue
    const d = parseJobDetail(html, c.url)
    if (d?.date) c.date = d.date
  }
}

export async function runSearch(opts: SearchOpts): Promise<number> {
  try {
    const html = await htmlFetch(LIST_URL)
    if (!html) {
      writeError(`Careers page not found at ${LIST_URL}`, "SEARCH_FAILED")
      return 1
    }
    const all = parseJobList(html)
    if (all.length === 0) {
      writeError(
        "Parsed 0 jobs from the careers page - the markup may have changed (see url-reference.md)",
        "PARSE_FAILED",
      )
      return 1
    }

    let cards = all.filter(
      (c) =>
        matchesQuery(c, opts.query) &&
        matchesLocation(c, opts.location) &&
        (!opts.remote || c.workplace === opts.remote),
    )

    if (opts.jobage !== undefined) {
      await fillDates(cards)
      const cutoff = Date.now() - opts.jobage * 86400_000
      // A job whose date could not be read is kept: dropping it would hide a
      // live posting because of a parse miss.
      cards = cards.filter((c) => !c.date || Date.parse(c.date) >= cutoff)
    }

    cards = cards.slice((opts.page - 1) * PAGE_SIZE, opts.page * PAGE_SIZE)
    if (opts.limit !== undefined) cards = cards.slice(0, opts.limit)

    if (opts.format === "table") {
      process.stdout.write(renderTable(cards) + "\n")
    } else if (opts.format === "plain") {
      process.stdout.write(
        (cards.length
          ? cards
              .map(
                (c) =>
                  `${c.title}\n  ${c.company || "—"} · ${c.location || "—"} · ${c.date || "—"}\n  ${
                    c.skills.length ? "skills: " + c.skills.join(", ") + "\n  " : ""
                  }id: ${c.id}\n  ${c.url}`,
              )
              .join("\n\n")
          : "No results.") + "\n",
      )
    } else {
      process.stdout.write(
        JSON.stringify({ meta: { count: cards.length, page: opts.page, total: all.length }, results: cards }, null, 2) +
          "\n",
      )
    }
    return 0
  } catch (e) {
    writeError(e instanceof Error ? e.message : String(e), "SEARCH_FAILED")
    return 1
  }
}
