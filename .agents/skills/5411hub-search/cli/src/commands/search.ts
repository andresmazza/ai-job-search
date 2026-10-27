import {
  LISTING_URL,
  htmlFetch,
  parseCurrentPage,
  parseJobCards,
  parseSelectOptions,
  parseTotalPages,
  writeError,
  type JobResult,
} from "../helpers.js"

export const PAGE_SIZE = 9 // fixed by the site

export type RemoteMode = "remote" | "hybrid" | "onsite"
export const REMOTE_FLAG_VALUES: RemoteMode[] = ["remote", "hybrid", "onsite"]

// --remote mode -> the job_type option label on the site's filter form.
const JOB_TYPE_LABEL: Record<RemoteMode, string> = { remote: "remote", hybrid: "hybrid", onsite: "on-site" }

export interface SearchOpts {
  query?: string
  location?: string
  remote?: RemoteMode
  page: number
  limit?: number
  format: "json" | "table" | "plain"
}

/** Thrown for a filter value the site's form does not offer (exit 1, BAD_ARG). */
export class FilterValueError extends Error {}

export function buildListingUrl(params: { search?: string; location?: string; jobType?: string; page: number }): string {
  const p = new URLSearchParams()
  if (params.search) p.set("search", params.search)
  if (params.location) p.set("location", params.location)
  if (params.jobType) p.set("job_type", params.jobType)
  if (params.page > 1) p.set("job_page", String(params.page))
  const qs = p.toString()
  return qs ? `${LISTING_URL}?${qs}` : LISTING_URL
}

/** Resolve --location / --remote names to the form's term ids (read from any listing page). */
export function resolveFilters(formHtml: string, opts: SearchOpts): { location?: string; jobType?: string } {
  const out: { location?: string; jobType?: string } = {}
  if (opts.location) {
    const locations = parseSelectOptions(formHtml, "location")
    const id = locations.get(opts.location.trim().toLowerCase())
    if (!id) {
      const known = [...locations.keys()].filter((k) => /argentin|chile|colombia|mexic|urug|peru|brazil|united states|spain|venezuela|costa rica/.test(k))
      throw new FilterValueError(
        `--location "${opts.location}" is not one of the site's location options (country names, e.g. ${known.slice(0, 6).join(", ")})`,
      )
    }
    out.location = id
  }
  if (opts.remote) {
    const types = parseSelectOptions(formHtml, "job_type")
    const id = types.get(JOB_TYPE_LABEL[opts.remote])
    if (!id) throw new FilterValueError(`the site's job type filter has no "${JOB_TYPE_LABEL[opts.remote]}" option any more; see url-reference.md`)
    out.jobType = id
  }
  return out
}

function renderTable(rows: JobResult[]): string {
  if (rows.length === 0) return "No results."
  const cols: [string, number, (r: JobResult) => string][] = [
    ["ID", 4, (r) => r.id],
    ["TITLE", 56, (r) => r.title],
    ["LOCATION", 22, (r) => r.location ?? "—"],
    ["TYPE", 30, (r) => r.jobType.join(", ") || "—"],
    ["LANGUAGES", 28, (r) => r.languages.join(", ") || "—"],
  ]
  const line = (cells: string[]) => cells.map((c, i) => c.slice(0, cols[i][1]).padEnd(cols[i][1])).join("  ")
  const header = line(cols.map((c) => c[0]))
  return [header, "-".repeat(header.length), ...rows.map((r) => line(cols.map((c) => c[2](r))))].join("\n")
}

function renderPlain(rows: JobResult[]): string {
  if (rows.length === 0) return "No results."
  return rows
    .map((r) =>
      [
        r.title,
        `  ${r.location ?? "—"} · ${r.jobType.join(", ") || "—"}`,
        `  skills: ${r.skills.join(", ") || "—"} · languages: ${r.languages.join(", ") || "—"}`,
        `  id: ${r.id}`,
        `  ${r.url}`,
      ].join("\n"),
    )
    .join("\n\n")
}

export async function runSearch(opts: SearchOpts): Promise<number> {
  try {
    let filters: { location?: string; jobType?: string } = {}
    if (opts.location || opts.remote) {
      // Term ids come from the filter form, which every listing page carries.
      const formHtml = await htmlFetch(LISTING_URL)
      if (formHtml === null) {
        writeError("job listing page not found (/job-listing/) — the site may have moved it; see url-reference.md", "SEARCH_FAILED")
        return 1
      }
      filters = resolveFilters(formHtml, opts)
    }

    const html = await htmlFetch(buildListingUrl({ search: opts.query, ...filters, page: opts.page }))
    if (html === null) {
      writeError("job listing page not found (/job-listing/) — the site may have moved it; see url-reference.md", "SEARCH_FAILED")
      return 1
    }
    const totalPages = parseTotalPages(html)
    // Past the last page the site serves the last page again instead of nothing.
    const served = parseCurrentPage(html) ?? 1
    let rows = opts.page > totalPages || served !== opts.page ? [] : parseJobCards(html)
    if (opts.limit) rows = rows.slice(0, opts.limit)

    if (opts.format === "table") process.stdout.write(renderTable(rows) + "\n")
    else if (opts.format === "plain") process.stdout.write(renderPlain(rows) + "\n")
    else {
      process.stdout.write(
        JSON.stringify({ meta: { count: rows.length, page: opts.page, pageSize: PAGE_SIZE, totalPages }, results: rows }, null, 2) + "\n",
      )
    }
    return 0
  } catch (e) {
    if (e instanceof FilterValueError) {
      writeError(e.message, "BAD_ARG")
      return 1
    }
    writeError(e instanceof Error ? e.message : String(e), "SEARCH_FAILED")
    return 1
  }
}
