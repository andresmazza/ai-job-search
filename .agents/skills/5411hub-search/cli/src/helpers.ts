// Data source: 5411 Hub (5411hub.com), a Buenos Aires tech recruiting agency
// that places LatAm talent with Argentine and US companies.
//
//   - search: the public job board page /job-listing/ (server-rendered HTML).
//     Its filter form takes GET params: search (keywords), location (country
//     term id), job_type (term id: Remote / Hybrid / On-Site / Contractor ...),
//     skills, category, and job_page (1-indexed, 9 cards per page). Term ids are
//     read from the form's <select> options at runtime, never hard-coded.
//   - detail: /job-detail/<slug>-<id>/ (only the trailing numeric id matters;
//     /job-detail/<id>/ works too). Unknown ids return HTTP 200 with
//     "El empleo no fue encontrado." and no job article.
//
// robots.txt (Yoast) disallows nothing. The site's own JSON API
// (/wp-json/5411hub/v1/jobs) requires a JWT and is not used. The legacy
// /wp-json/wp/v2/awsm_job_openings feed stopped updating in July 2026 and is
// not used either. Postings carry NO publication date anywhere.

export const BASE = "https://5411hub.com"
export const LISTING_URL = `${BASE}/job-listing/`

/** 5411 Hub is the recruiter of record; client companies are not named on the board. */
export const COMPANY = "5411 Hub"

const UA = "Mozilla/5.0 (compatible; 5411hub-cli/1.0)"

export function writeError(error: string, code: string): void {
  process.stderr.write(JSON.stringify({ error, code }) + "\n")
}

/** Fetch text with exponential backoff + jitter on 429/5xx (max 6 retries). Returns null on 404/410. */
export async function htmlFetch(url: string): Promise<string | null> {
  const maxRetries = 6
  let delay = 500
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    let response: Response
    try {
      response = await fetch(url, {
        headers: {
          "User-Agent": UA,
          Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "es-AR,es;q=0.9,en;q=0.8",
        },
        redirect: "follow",
        signal: AbortSignal.timeout(20000),
      })
    } catch (e) {
      throw new Error(`could not reach 5411hub.com (${e instanceof Error ? e.message : String(e)})`)
    }
    if (response.status === 429 || response.status >= 500) {
      if (attempt === maxRetries) throw new Error(`Request failed: ${response.status} ${response.statusText}`)
      const jitter = Math.floor(Math.random() * 500)
      await new Promise((r) => setTimeout(r, delay + jitter))
      delay = Math.min(delay * 2, 8000)
      continue
    }
    if (response.status === 404 || response.status === 410) return null
    if (!response.ok) throw new Error(`Request failed: ${response.status} ${response.statusText}`)
    return response.text()
  }
  throw new Error("Request failed after max retries")
}

// ---------------------------------------------------------------------------
// Text helpers
// ---------------------------------------------------------------------------

const NAMED_ENTITIES: Record<string, string> = {
  lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", mdash: "—", ndash: "–", hellip: "…",
  laquo: "«", raquo: "»", ldquo: "“", rdquo: "”", lsquo: "‘", rsquo: "’", bull: "•", middot: "·",
  iexcl: "¡", iquest: "¿", ordf: "ª", ordm: "º", deg: "°", euro: "€",
  aacute: "á", eacute: "é", iacute: "í", oacute: "ó", uacute: "ú", Aacute: "Á", Eacute: "É",
  Iacute: "Í", Oacute: "Ó", Uacute: "Ú", ntilde: "ñ", Ntilde: "Ñ", uuml: "ü", Uuml: "Ü",
}

function numericEntity(cp: number): string {
  return cp >= 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : ""
}

export function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&([a-zA-Z]+);/g, (whole, name: string) => (name === "amp" ? whole : (NAMED_ENTITIES[name] ?? whole)))
    .replace(/&#(\d+);/g, (_, dec) => numericEntity(parseInt(dec, 10)))
    .replace(/&#[xX]([0-9a-fA-F]+);/g, (_, hex) => numericEntity(parseInt(hex, 16)))
    .replace(/&amp;/g, "&")
}

/** Inline HTML -> single-line text. */
export function inlineText(html: string | null | undefined): string {
  if (!html) return ""
  return decodeHtmlEntities(html.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim()
}

/** Block HTML -> readable text: list items become "- " lines, headings "## ", blocks paragraphs. */
export function htmlToText(html: string | null | undefined): string {
  if (!html) return ""
  const text = html
    .replace(/<\s*(script|style)[^>]*>[\s\S]*?<\/\s*\1\s*>/gi, "")
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\s*h[1-6][^>]*>/gi, "\n\n## ")
    .replace(/<\s*li[^>]*>/gi, "\n- ")
    .replace(/<\/(p|div|ul|ol|h[1-6]|section)>/gi, "\n\n")
    .replace(/<[^>]+>/g, " ")
  return decodeHtmlEntities(text)
    .replace(/[ \t ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/^##\s*$/gm, "")
    .replace(/^-\s*$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    // List items here wrap their text in <p>, which leaves a blank line between bullets.
    .replace(/(^- [^\n]*)\n\n(?=- )/gm, "$1\n")
    .replace(/(^- [^\n]*)\n\n(?=- )/gm, "$1\n")
    .trim()
}

/** "A • B • C" or "A, B, C" -> ["A","B","C"] */
export function splitTerms(text: string | null): string[] {
  if (!text) return []
  return text
    .split(/\s*[•,]\s*/)
    .map((t) => t.trim())
    .filter(Boolean)
}

// ---------------------------------------------------------------------------
// Ids and URLs
// ---------------------------------------------------------------------------

/** The trailing numeric id of a /job-detail/<slug>-<id>/ URL. */
export function idFromUrl(url: string): string | null {
  return url.match(/\/job-detail\/(?:[^/]*?-)?(\d+)\/?(?:[?#].*)?$/i)?.[1] ?? null
}

export function detailUrl(id: string): string {
  return `${BASE}/job-detail/${id}/`
}

/**
 * A numeric job id from a bare id or a 5411hub.com /job-detail/ URL. URLs on any
 * other host are rejected (real URL parsing, so look-alike hosts fail).
 */
export function parseJobInput(input: string): { id: string; url: string } | null {
  const trimmed = input.trim()
  if (/^\d{1,7}$/.test(trimmed)) return { id: trimmed, url: detailUrl(trimmed) }
  const hasScheme = /^https?:\/\//i.test(trimmed)
  if (!hasScheme && !/^(www\.)?5411hub\.com\//i.test(trimmed)) return null
  let parsed: URL
  try {
    parsed = new URL(hasScheme ? trimmed : `https://${trimmed}`)
  } catch {
    return null
  }
  if (!/^(www\.)?5411hub\.com$/i.test(parsed.hostname)) return null
  const id = idFromUrl(parsed.pathname)
  return id ? { id, url: `${BASE}${parsed.pathname.endsWith("/") ? parsed.pathname : parsed.pathname + "/"}` } : null
}

// ---------------------------------------------------------------------------
// Listing page parsing
// ---------------------------------------------------------------------------

export interface JobResult {
  id: string
  title: string
  company: string
  location: string | null
  date: null
  url: string
  skills: string[]
  categories: string[]
  jobType: string[]
  languages: string[]
}

function spec(card: string, name: string): string | null {
  const re = new RegExp(
    `awsm-job-specification-${name}"[\\s\\S]*?awsm-job-specification-terms">([\\s\\S]*?)</span>`,
    "i",
  )
  const m = card.match(re)
  return m ? inlineText(m[1]) || null : null
}

/**
 * Parse the job cards (<a ... class="awsm-job-item">) of a listing page.
 * Each card is split out and parsed on its own, so one malformed card cannot
 * break the rest.
 */
export function parseJobCards(html: string): JobResult[] {
  const out: JobResult[] = []
  const chunks = html.split(/<a\s+(?=href="[^"]*"\s+class="awsm-job-item")/i).slice(1)
  for (const chunk of chunks) {
    // A card ends at its "More Details" container; anything after it (the next
    // card is already split off, the last chunk carries the pagination) is dropped.
    const more = chunk.indexOf("awsm-job-more-container")
    const card = more > 0 ? chunk.slice(0, more) : chunk
    const href = card.match(/^href="([^"]+)"/i)?.[1]
    if (!href) continue
    const url = decodeHtmlEntities(href)
    const id = idFromUrl(url)
    const title = inlineText(card.match(/class="awsm-job-post-title">([\s\S]*?)<\/h2>/i)?.[1])
    if (!id || !title) continue
    out.push({
      id,
      title,
      company: COMPANY,
      location: splitTerms(spec(card, "job-location")).join(", ") || null,
      date: null,
      url,
      skills: splitTerms(spec(card, "skills-needed")),
      categories: splitTerms(spec(card, "job-category")),
      jobType: splitTerms(spec(card, "job-type")),
      languages: splitTerms(spec(card, "job-languages")),
    })
  }
  return out
}

/**
 * Total pages: the highest page linked from the pagination (?job_page=N) or the
 * current page's own number, whichever is larger. The current page is not a
 * link, and a page number past the end is served the LAST page, whose links
 * stop one short of the total.
 */
export function parseTotalPages(html: string): number {
  const linked = [...html.matchAll(/[?&](?:amp;)?job_page=(\d+)/g)].map((m) => Number(m[1]))
  const current = [...html.matchAll(/hub-pagination-current">\s*(\d+)/g)].map((m) => Number(m[1]))
  return Math.max(1, ...linked, ...current)
}

/** The page number the site actually served (it serves the last page for an out-of-range request). */
export function parseCurrentPage(html: string): number | null {
  const m = html.match(/hub-pagination-current">\s*(\d+)/)
  return m ? Number(m[1]) : null
}

/** Options of a <select name="..."> in the filter form: lowercased label -> term id. */
export function parseSelectOptions(html: string, name: string): Map<string, string> {
  const map = new Map<string, string>()
  const sel = html.match(new RegExp(`<select[^>]*name="${name}"[^>]*>([\\s\\S]*?)</select>`, "i"))
  if (!sel) return map
  for (const m of sel[1].matchAll(/<option value="(\d+)"[^>]*>([^<]*)/gi)) {
    const label = inlineText(m[2]).toLowerCase()
    if (label) map.set(label, m[1])
  }
  return map
}

// ---------------------------------------------------------------------------
// Detail page parsing
// ---------------------------------------------------------------------------

export interface JobDetail {
  id: string
  title: string
  company: string
  location: string | null
  date: null
  url: string
  skills: string[]
  categories: string[]
  jobType: string[]
  languages: string[]
  description: string | null
}

function metaItem(html: string, cls: string): string | null {
  const m = html.match(new RegExp(`hub-job-meta-item ${cls}"[\\s\\S]*?<span>([\\s\\S]*?)</span>`, "i"))
  return m ? inlineText(m[1]) || null : null
}

/** Parse a /job-detail/ page. Returns null when there is no job article ("El empleo no fue encontrado."). */
export function parseJobPage(html: string, id: string, url: string): JobDetail | null {
  const start = html.indexOf('class="hub-job-detail-container"')
  if (start < 0) return null
  const end = html.indexOf("</article>", start)
  const article = html.slice(start, end > 0 ? end : start + 100000)
  const title = inlineText(article.match(/class="hub-job-title">([\s\S]*?)<\/h1>/i)?.[1])
  if (!title) return null

  const descStart = article.indexOf('class="hub-job-section hub-job-description"')
  const metaStart = article.indexOf('class="hub-job-meta"')
  let description: string | null = null
  if (descStart >= 0) {
    const open = article.indexOf(">", descStart) + 1
    const stop = metaStart > open ? article.lastIndexOf("<", metaStart) : article.length
    description = htmlToText(article.slice(open, stop)) || null
  }
  const meta = metaStart >= 0 ? article.slice(metaStart) : ""

  return {
    id,
    title,
    company: COMPANY,
    location: metaItem(meta, "hub-job-location"),
    date: null,
    url,
    skills: splitTerms(metaItem(meta, "hub-job-skills")),
    categories: splitTerms(metaItem(meta, "hub-job-category")),
    jobType: splitTerms(metaItem(meta, "hub-job-type")),
    languages: splitTerms(metaItem(meta, "hub-job-languages")),
    description,
  }
}
