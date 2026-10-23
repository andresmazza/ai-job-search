// Data source: Remote.io public pages only.
//
// Remote.io is a client-rendered app. Its search API (/api/...) is disallowed by
// robots.txt and gated behind a Cloudflare Turnstile challenge, so this CLI does
// NOT use it. Instead:
//   - search: the public job sitemap (sitemap-active-jobs.xml) lists every active
//     posting as /remote-jobs/<category>/<title-slug>[-at-<company-slug>]-<id>
//     with a <lastmod> date. We match the query against the slug words.
//   - detail / enrichment: each job page embeds a schema.org JobPosting JSON-LD
//     block (<script type="application/ld+json" data-job-posting="true">) with
//     title, company, dates, locations, salary and the full HTML description.

export const BASE = "https://remote.io"
export const SITEMAP_INDEX = `${BASE}/sitemap.xml`
export const ACTIVE_SITEMAP = `${BASE}/sitemap-active-jobs.xml`

const UA = "Mozilla/5.0 (compatible; remoteio-cli/1.0)"

export function writeError(error: string, code: string): void {
  process.stderr.write(JSON.stringify({ error, code }) + "\n")
}

/** Fetch text with exponential backoff + jitter on 429/5xx. Returns "" on 404/410. */
export async function htmlFetch(url: string): Promise<string> {
  const maxRetries = 6
  let delay = 500
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await fetch(url, {
      headers: {
        "User-Agent": UA,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(20000),
    })
    if (response.status === 429 || response.status >= 500) {
      if (attempt === maxRetries) {
        throw new Error(`Request failed: ${response.status} ${response.statusText}`)
      }
      const jitter = Math.floor(Math.random() * 500)
      await new Promise((r) => setTimeout(r, delay + jitter))
      delay = Math.min(delay * 2, 8000)
      continue
    }
    if (response.status === 404 || response.status === 410) return ""
    if (!response.ok) {
      throw new Error(`Request failed: ${response.status} ${response.statusText}`)
    }
    return response.text()
  }
  throw new Error("Request failed after max retries")
}

// ---------------------------------------------------------------------------
// Sitemap parsing
// ---------------------------------------------------------------------------

export interface SitemapEntry {
  id: string
  url: string
  category: string
  /** Slug words before "-at-<company>" (or the whole slug when there is no "-at-"). */
  titleSlug: string
  /** Company slug after the last "-at-", or null when the slug has none. */
  companySlug: string | null
  lastmod: string | null
}

const JOB_URL_RE = /^https:\/\/remote\.io\/remote-jobs\/([a-z0-9-]+)\/([a-z0-9-]+)-(\d{4,})\/?$/i

/** Parse one job URL into its parts, or null if it is not a job URL. */
export function parseJobUrl(url: string): Omit<SitemapEntry, "lastmod"> | null {
  const m = url.trim().match(JOB_URL_RE)
  if (!m) return null
  const [, category, slug, id] = m
  const at = slug.lastIndexOf("-at-")
  const titleSlug = at > 0 ? slug.slice(0, at) : slug
  const companySlug = at > 0 ? slug.slice(at + 4) || null : null
  return { id, url: `${BASE}/remote-jobs/${category}/${slug}-${id}`, category, titleSlug, companySlug }
}

/**
 * Parse a <urlset> sitemap. Split per <url> block and parse each independently,
 * so one malformed entry cannot break the rest.
 */
export function parseSitemap(xml: string): SitemapEntry[] {
  const out: SitemapEntry[] = []
  for (const chunk of xml.split(/<url>/i).slice(1)) {
    const loc = chunk.match(/<loc>\s*([^<]+?)\s*<\/loc>/i)?.[1]
    if (!loc) continue
    const parsed = parseJobUrl(decodeHtmlEntities(loc))
    if (!parsed) continue
    const lastmod = chunk.match(/<lastmod>\s*([^<]+?)\s*<\/lastmod>/i)?.[1] ?? null
    out.push({ ...parsed, lastmod })
  }
  return out
}

/** List job sitemaps (active first, then expired) from the sitemap index. */
export function parseSitemapIndex(xml: string): string[] {
  const locs = [...xml.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/gi)].map((m) => m[1])
  const jobs = locs.filter((l) => /sitemap-(active|expired)-jobs[^/]*\.xml$/i.test(l))
  return jobs.sort((a, b) => Number(/expired/i.test(a)) - Number(/expired/i.test(b)))
}

/** Lowercase alphanumeric words, for slug matching. "Full-Stack (PHP)" -> ["full","stack","php"] */
export function words(text: string): string[] {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
}

/** True when every query word appears as a word in the entry's slug (title + company). */
export function matchesQuery(entry: SitemapEntry, query: string | undefined): boolean {
  if (!query) return true
  const have = new Set(words(`${entry.titleSlug} ${entry.companySlug ?? ""}`))
  return words(query).every((w) => have.has(w))
}

/** Best-effort title-case of a slug, used only when the job page cannot be fetched. */
export function slugToText(slug: string): string {
  return slug
    .split("-")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ")
}

// ---------------------------------------------------------------------------
// Job page (JSON-LD) parsing
// ---------------------------------------------------------------------------

export interface JobCard {
  id: string
  title: string
  company: string | null
  location: string | null
  date: string | null
  url: string
  category: string | null
  salary: string | null
}

export interface JobDetail extends JobCard {
  employmentType: string | null
  validThrough: string | null
  description: string | null
  isActive: boolean
}

function numericEntity(cp: number): string {
  return cp >= 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : ""
}

export function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, dec) => numericEntity(parseInt(dec, 10)))
    .replace(/&#[xX]([0-9a-fA-F]+);/g, (_, hex) => numericEntity(parseInt(hex, 16)))
    // &amp; last so "&amp;lt;" decodes to the literal text "&lt;", not "<".
    .replace(/&amp;/g, "&")
}

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
}

function clean(html: string): string {
  return decodeHtmlEntities(stripTags(html)).replace(/\s+/g, " ").trim()
}

/** Convert the HTML description to readable text, keeping paragraph and list breaks. */
export function htmlToText(html: string): string {
  const withBreaks = html
    .replace(/\s+/g, " ")
    // Inline tags vanish without a space, so "<a>Program</a>." stays "Program.".
    .replace(/<\/?(a|strong|em|b|i|u|span|code)(\s[^>]*)?>/gi, "")
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<li[^>]*>/gi, "\n• ")
    .replace(/<\/(p|li|ul|ol|div|h\d|tr)>/gi, "\n")
  return withBreaks
    .split("\n")
    .map(clean)
    .join("\n")
    .replace(/\n•\s*(?=\n)/g, "")
    .replace(/\n{3,}/g, "\n\n")
    // Consecutive list items on adjacent lines, not separated by a blank one.
    .replace(/\n\n(?=• )/g, (m, off, s) => (s.slice(0, off).split("\n").pop()?.startsWith("• ") ? "\n" : m))
    .trim()
}

/** Pull the schema.org JobPosting object out of a job page, or null. */
export function extractJobPosting(html: string): Record<string, any> | null {
  const blocks = [...html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)]
  // Prefer the block the site marks as the job posting.
  blocks.sort((a, b) => Number(/data-job-posting/.test(b[0])) - Number(/data-job-posting/.test(a[0])))
  for (const b of blocks) {
    try {
      const data = JSON.parse(b[1])
      const nodes = Array.isArray(data?.["@graph"]) ? data["@graph"] : [data]
      const job = nodes.find((n: any) => n?.["@type"] === "JobPosting")
      if (job) return job
    } catch {
      // Malformed block: try the next one.
    }
  }
  return null
}

const asArray = <T>(v: T | T[] | null | undefined): T[] => (v == null ? [] : Array.isArray(v) ? v : [v])

/** Readable location: applicant location requirements, else job location countries. */
export function formatLocation(job: Record<string, any>): string | null {
  const names = asArray(job.applicantLocationRequirements)
    .map((r: any) => (typeof r === "string" ? r : r?.name))
    .filter((n: unknown): n is string => typeof n === "string" && n.trim() !== "")
  if (names.length === 0) {
    for (const p of asArray(job.jobLocation)) {
      const addr = (p as any)?.address
      const parts = [addr?.addressLocality, addr?.addressRegion, addr?.addressCountry].filter(
        (x: unknown): x is string => typeof x === "string" && x.trim() !== "",
      )
      if (parts.length) names.push(parts.join(", "))
    }
  }
  const uniq = [...new Set(names.map((n) => n.trim()))]
  if (uniq.length) return uniq.join("; ")
  return job.jobLocationType === "TELECOMMUTE" ? "Remote (no location restriction listed)" : null
}

function formatSalary(job: Record<string, any>): string | null {
  const s = job.baseSalary
  if (!s || typeof s !== "object") return null
  const v = s.value ?? {}
  const cur = s.currency ?? v.currency ?? ""
  const fmt = (n: unknown) => (typeof n === "number" ? n.toLocaleString("en-US") : null)
  const min = fmt(v.minValue)
  const max = fmt(v.maxValue)
  const one = fmt(v.value)
  const range = min && max ? `${min}–${max}` : min ?? max ?? one
  if (!range) return null
  const unit = typeof v.unitText === "string" ? `/${v.unitText.toLowerCase()}` : ""
  return `${cur} ${range}${unit}`.trim()
}

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v.trim() : null)

/** Build a full job record from a job page. `fallback` supplies the sitemap-derived values. */
export function parseJobPage(html: string, fallback: Omit<SitemapEntry, "lastmod"> & { lastmod?: string | null }): JobDetail | null {
  const job = extractJobPosting(html)
  if (!job) return null
  const validThrough = str(job.validThrough)
  const expired = validThrough ? Date.parse(validThrough) < Date.now() : false
  const employment = asArray(job.employmentType).filter((x) => typeof x === "string").join(", ")
  const id = str(job.identifier?.value) ?? fallback.id
  return {
    id,
    title: clean(str(job.title) ?? "") || slugToText(fallback.titleSlug),
    company: str(job.hiringOrganization?.name) ?? (fallback.companySlug ? slugToText(fallback.companySlug) : null),
    location: formatLocation(job),
    date: str(job.datePosted) ?? fallback.lastmod ?? null,
    url: str(job.url) ?? fallback.url,
    category: fallback.category,
    salary: formatSalary(job),
    employmentType: employment || null,
    validThrough,
    description: typeof job.description === "string" ? htmlToText(job.description) || null : null,
    isActive: !expired,
  }
}

/** Card built from the sitemap alone (used when a job page cannot be fetched). */
export function cardFromEntry(e: SitemapEntry): JobCard {
  return {
    id: e.id,
    title: slugToText(e.titleSlug),
    company: e.companySlug ? slugToText(e.companySlug) : null,
    location: null,
    date: e.lastmod,
    url: e.url,
    category: e.category,
    salary: null,
  }
}

/** Run async work over items with a small concurrency cap (keeps request volume polite). */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let next = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++
      out[i] = await fn(items[i])
    }
  })
  await Promise.all(workers)
  return out
}
