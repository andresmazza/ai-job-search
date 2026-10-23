import {
  ACTIVE_SITEMAP,
  cardFromEntry,
  htmlFetch,
  mapLimit,
  matchesQuery,
  parseJobPage,
  parseSitemap,
  writeError,
  type JobCard,
  type SitemapEntry,
} from "../helpers.js"

export const PAGE_SIZE = 20
/** Most job pages one --location search will fetch (keeps request volume low). */
export const MAX_LOCATION_SCAN = 60

export interface SearchOpts {
  query?: string
  location?: string
  category?: string
  jobage?: number
  page: number
  limit?: number
  enrich: boolean
  format: "json" | "table" | "plain"
}

const LATAM = [
  "latam", "latin america", "south america", "central america", "americas",
  "argentina", "bolivia", "brazil", "brasil", "chile", "colombia", "costa rica", "cuba",
  "dominican republic", "ecuador", "el salvador", "guatemala", "honduras", "mexico",
  "nicaragua", "panama", "paraguay", "peru", "puerto rico", "uruguay", "venezuela",
]
const WORLDWIDE = ["worldwide", "anywhere", "global", "no location restriction"]

/** Location filter: case-insensitive substring, with LATAM and worldwide aliases. */
export function matchesLocation(card: JobCard, wanted: string): boolean {
  const w = wanted.trim().toLowerCase()
  const hay = `${card.location ?? ""} ${card.title}`.toLowerCase()
  let needles = [w]
  if (["latam", "latin america"].includes(w)) needles = LATAM
  else if (WORLDWIDE.includes(w)) needles = WORLDWIDE
  return needles.some((n) => hay.includes(n))
}

/** Midnight UTC of the day `days` before today: the oldest lastmod a --jobage search keeps. */
function cutoffDay(days: number): number {
  const now = new Date()
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - days * 86400000
}

function renderTable(cards: JobCard[]): string {
  if (cards.length === 0) return "No results."
  const header =
    "ID".padEnd(8) + " " + "TITLE".padEnd(44) + " " + "COMPANY".padEnd(22) + " " + "LOCATION".padEnd(28) + " DATE"
  const rows = cards.map((c) =>
    [
      c.id.padEnd(8),
      (c.title || "").slice(0, 44).padEnd(44),
      (c.company || "—").slice(0, 22).padEnd(22),
      (c.location || "—").slice(0, 28).padEnd(28),
      (c.date || "—").slice(0, 10),
    ].join(" "),
  )
  return [header, "-".repeat(header.length), ...rows].join("\n")
}

export async function runSearch(opts: SearchOpts): Promise<number> {
  try {
    const xml = await htmlFetch(ACTIVE_SITEMAP)
    if (!xml) {
      writeError("Remote.io job sitemap not found (the portal may have moved it)", "SITEMAP_NOT_FOUND")
      return 1
    }
    const all = parseSitemap(xml)
    if (all.length === 0) {
      writeError("Remote.io job sitemap parsed to zero jobs (markup changed?)", "PARSE_FAILED")
      return 1
    }

    const cutoff = opts.jobage !== undefined ? cutoffDay(opts.jobage) : null
    const category = opts.category?.toLowerCase()
    let matches: SitemapEntry[] = all.filter(
      (e) =>
        matchesQuery(e, opts.query) &&
        (!category || e.category.toLowerCase().startsWith(category)) &&
        // One day of slack: lastmod is a date only and can lag datePosted by a day.
        (cutoff === null || !e.lastmod || Date.parse(e.lastmod) >= cutoff - 86400000),
    )
    matches.sort((a, b) => (b.lastmod ?? "").localeCompare(a.lastmod ?? "") || Number(b.id) - Number(a.id))

    const totalMatches = matches.length
    const enrich = async (e: SitemapEntry): Promise<JobCard> => {
      try {
        const html = await htmlFetch(e.url)
        const job = html ? parseJobPage(html, e) : null
        if (!job) return cardFromEntry(e)
        const { description: _d, employmentType: _e, validThrough: _v, isActive: _a, ...card } = job
        return card
      } catch {
        return cardFromEntry(e)
      }
    }
    const keep = (c: JobCard) =>
      (cutoff === null || !c.date || Date.parse(c.date) >= cutoff) &&
      (!opts.location || matchesLocation(c, opts.location))

    let cards: JobCard[]
    let scanned = 0
    let scanTruncated = false
    if (opts.location) {
      // Location lives only on the job page, so scan title matches in order,
      // fetching pages in small batches until this page of filtered results is full.
      // Pagination here is over the filtered results.
      const want = (opts.page - 1) * PAGE_SIZE + Math.min(PAGE_SIZE, opts.limit ?? PAGE_SIZE)
      const kept: JobCard[] = []
      while (kept.length < want && scanned < matches.length) {
        if (scanned >= MAX_LOCATION_SCAN) {
          scanTruncated = true
          break
        }
        const batch = matches.slice(scanned, Math.min(scanned + 6, matches.length, MAX_LOCATION_SCAN))
        scanned += batch.length
        kept.push(...(await mapLimit(batch, 3, enrich)).filter(keep))
      }
      cards = kept.slice((opts.page - 1) * PAGE_SIZE, want)
    } else {
      let pageItems = matches.slice((opts.page - 1) * PAGE_SIZE, opts.page * PAGE_SIZE)
      // --limit caps before enrichment, saving requests.
      if (opts.limit !== undefined) pageItems = pageItems.slice(0, opts.limit)
      scanned = pageItems.length
      cards = opts.enrich ? (await mapLimit(pageItems, 3, enrich)).filter(keep) : pageItems.map(cardFromEntry)
    }
    if (opts.limit !== undefined) cards = cards.slice(0, opts.limit)
    if (scanTruncated) {
      process.stderr.write(
        `warning: --location scanned the newest ${MAX_LOCATION_SCAN} title matches (of ${totalMatches}); narrow --query or --category to reach older ones\n`,
      )
    }

    if (opts.format === "table") {
      process.stdout.write(renderTable(cards) + "\n")
    } else if (opts.format === "plain") {
      process.stdout.write(
        (cards.length === 0
          ? "No results."
          : cards
              .map(
                (c) =>
                  `${c.title}\n  ${c.company || "—"} · ${c.location || "—"} · ${c.date || "—"}${c.salary ? ` · ${c.salary}` : ""}\n  id: ${c.id}\n  ${c.url}`,
              )
              .join("\n\n")) + "\n",
      )
    } else {
      process.stdout.write(
        JSON.stringify(
          {
            meta: {
              count: cards.length,
              page: opts.page,
              pageSize: PAGE_SIZE,
              totalMatches,
              totalPages: opts.location ? null : Math.ceil(totalMatches / PAGE_SIZE),
              scanned,
              scanTruncated,
            },
            results: cards,
          },
          null,
          2,
        ) + "\n",
      )
    }
    return 0
  } catch (e) {
    writeError(e instanceof Error ? e.message : String(e), "SEARCH_FAILED")
    return 1
  }
}
