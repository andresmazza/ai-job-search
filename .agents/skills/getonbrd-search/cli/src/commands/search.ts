import { API, REMOTE_MODES, httpGet, toResult, writeError, type GobJob, type JobResult } from "../helpers.js"

// Results per API page. The API allows up to 120; search is relevance-ranked
// (not newest-first) and --jobage / --remote filter client-side, so a large
// page keeps those filters from emptying a page that has matches further down.
export const PAGE_SIZE = 100

const EXPAND = ["company", "location_cities", "location_tenants", "location_regions", "seniority", "modality"]

export type RemoteMode = "remote" | "anywhere" | "hybrid" | "onsite"
export const REMOTE_FLAG_VALUES: RemoteMode[] = ["remote", "anywhere", "hybrid", "onsite"]

export interface SearchOpts {
  query?: string
  countryCode?: string
  remote?: RemoteMode
  jobage?: number
  page: number
  limit?: number
  includeDescription: boolean
  format: "json" | "table" | "plain"
}

// Country names accepted by --location, mapped to the ISO 3166-1 alpha-2 code
// the API requires (it answers 422 to a name). Any two-letter code also works.
export const COUNTRY_CODES: Record<string, string> = {
  argentina: "ar", bolivia: "bo", brasil: "br", brazil: "br", chile: "cl", colombia: "co",
  "costa rica": "cr", cuba: "cu", ecuador: "ec", "el salvador": "sv", guatemala: "gt",
  honduras: "hn", mexico: "mx", "méxico": "mx", nicaragua: "ni", panama: "pa", "panamá": "pa",
  paraguay: "py", peru: "pe", "perú": "pe", "puerto rico": "pr", "dominican republic": "do",
  "republica dominicana": "do", "república dominicana": "do", uruguay: "uy", venezuela: "ve",
  spain: "es", "españa": "es", portugal: "pt", "united states": "us", usa: "us", canada: "ca",
}

/** --location value -> ISO alpha-2 code, or null when it is neither a code nor a known name. */
export function toCountryCode(raw: string): string | null {
  const v = raw.trim().toLowerCase()
  if (/^[a-z]{2}$/.test(v)) return v
  return COUNTRY_CODES[v] ?? null
}

export function matchesRemote(r: JobResult, mode: RemoteMode | undefined): boolean {
  if (!mode) return true
  const m = r.remoteModality ?? ""
  if (mode === "remote") return REMOTE_MODES.has(m)
  if (mode === "anywhere") return m === "fully_remote"
  if (mode === "hybrid") return m === "hybrid"
  return m === "no_remote"
}

export function withinDays(date: string | null, days: number | undefined, now = Date.now()): boolean {
  if (!days) return true
  if (!date) return true // keep undated postings rather than silently dropping them
  const t = Date.parse(`${date}T00:00:00Z`)
  return Number.isNaN(t) ? true : now - t <= days * 86_400_000
}

export function buildSearchUrl(opts: SearchOpts): string {
  const p = new URLSearchParams()
  if (opts.query) p.set("query", opts.query)
  // The API rejects country_code + remote together (422 "Localization conflict"),
  // and its remote=true means fully-remote only, so remote filtering is always
  // done client-side on remote_modality.
  if (opts.countryCode) p.set("country_code", opts.countryCode)
  p.set("per_page", String(PAGE_SIZE))
  p.set("page", String(opts.page))
  p.set("lang", "en")
  p.set("expand", JSON.stringify(EXPAND))
  return `${API}/search/jobs?${p.toString()}`
}

function renderTable(rows: JobResult[]): string {
  if (rows.length === 0) return "No results."
  const cols: [string, number, (r: JobResult) => string][] = [
    ["ID", Math.max(2, ...rows.map((r) => r.id.length)), (r) => r.id],
    ["TITLE", 40, (r) => r.title],
    ["COMPANY", 20, (r) => r.company ?? "—"],
    ["LOCATION", 34, (r) => r.location ?? "—"],
    ["DATE", 10, (r) => r.date ?? "—"],
    ["SALARY", 22, (r) => r.salary ?? "—"],
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
        `  ${r.company ?? "—"} · ${r.location ?? "—"} · ${r.date ?? "—"}`,
        `  ${[r.seniority, r.employmentType, r.salary].filter(Boolean).join(" · ") || "—"}`,
        `  id: ${r.id}`,
        `  ${r.url}`,
      ].join("\n"),
    )
    .join("\n\n")
}

export async function runSearch(opts: SearchOpts): Promise<number> {
  try {
    const body = await httpGet(buildSearchUrl(opts), "application/json")
    if (body === null) {
      writeError("search endpoint not found (/api/v0/search/jobs) — the API may have moved; see url-reference.md", "SEARCH_FAILED")
      return 1
    }
    let env: { data?: GobJob[]; meta?: { page?: number; per_page?: number; total_pages?: number } }
    try {
      env = JSON.parse(body)
    } catch {
      writeError("getonbrd API returned an unparseable response body", "SEARCH_FAILED")
      return 1
    }
    const totalPages = env.meta?.total_pages ?? 0
    // Past the last page the API still returns data (it does not answer with an
    // empty list), so stop here instead of emitting the same jobs again.
    const raw = opts.page > totalPages ? [] : (env.data ?? [])

    let rows = raw.map(toResult).filter((r) => matchesRemote(r, opts.remote) && withinDays(r.date, opts.jobage))
    if (opts.limit) rows = rows.slice(0, opts.limit)
    if (!opts.includeDescription) rows = rows.map((r) => ({ ...r, description: null }))

    if (opts.format === "table") process.stdout.write(renderTable(rows) + "\n")
    else if (opts.format === "plain") process.stdout.write(renderPlain(rows) + "\n")
    else {
      process.stdout.write(
        JSON.stringify(
          { meta: { count: rows.length, page: opts.page, pageSize: PAGE_SIZE, totalPages, scanned: raw.length }, results: rows },
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
