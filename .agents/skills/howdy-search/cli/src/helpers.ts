// Data source: Howdy.com's public careers board at https://www.howdylatam.com/careers
// (linked from howdy.com as "Apply as Talent"). No authentication required.
//
// The board is a Next.js page that ships every open job in one response, so
// there is no server-side search: search fetches the listing once and filters
// client-side. The job list is embedded in the React Server Components payload
// (`self.__next_f.push([1,"..."])` chunks) as a `"jobs":[{...}]` array. If that
// payload ever disappears we fall back to the rendered HTML job cards.
// The detail page carries a schema.org JobPosting JSON-LD block, which is the
// only place the posting date lives.

export const BASE_URL = "https://www.howdylatam.com"
export const LIST_URL = `${BASE_URL}/careers`

export function writeError(error: string, code: string): void {
  process.stderr.write(JSON.stringify({ error, code }) + "\n")
}

const UA = "Mozilla/5.0 (compatible; howdy-cli/1.0)"

/** Fetch HTML with exponential backoff + jitter on 429/5xx. Returns "" on a 404. */
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
      signal: AbortSignal.timeout(15000),
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
    if (response.status === 404) return ""
    if (!response.ok) {
      throw new Error(`Request failed: ${response.status} ${response.statusText}`)
    }
    return response.text()
  }
  throw new Error("Request failed after max retries")
}

export interface JobCard {
  id: string
  title: string
  company: string | null
  location: string | null
  date: string | null
  url: string
  category: string | null
  workingHours: string | null
  workplace: string | null // "remote" | "hybrid" | "onsite" | raw value
  countries: string[]
  skills: string[]
}

export interface JobDetail extends JobCard {
  description: string | null
  seniority: string | null
  employmentType: string | null
  experienceYears: number | null
  benefits: string | null
  cities: string[]
  applyUrl: string
}

// Howdy is the employer of record; the US client company is not disclosed.
export const COMPANY = "Howdy.com"

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
    .replace(/&#(\d+);/g, (_, dec) => numericEntity(parseInt(dec, 10)))
    .replace(/&#[xX]([0-9a-fA-F]+);/g, (_, hex) => numericEntity(parseInt(hex, 16)))
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
}

function clean(html: string): string {
  return decodeHtmlEntities(html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ")).replace(/ /g, " ").trim()
}

/** HTML fragment -> readable text, keeping list items and paragraphs on their own lines. */
export function htmlToText(html: string): string {
  const withBreaks = html
    .replace(/\s+/g, " ")
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<li[^>]*>/gi, "\n- ")
    .replace(/<\/(p|li|ul|ol|div|h\d)>/gi, "\n")
    .replace(/<(ul|ol|p|h\d)[^>]*>/gi, "\n")
  return withBreaks
    .split("\n")
    .map((l) => (l.trim().startsWith("- ") ? "- " + clean(l.trim().slice(2)) : clean(l)))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/\n\n(?=- )/g, "\n") // keep list items tight
    .trim()
}

function normWorkplace(raw: string | null | undefined): string | null {
  if (!raw) return null
  const v = raw.toLowerCase()
  if (v.includes("remote")) return "remote"
  if (v.includes("hybrid")) return "hybrid"
  if (v.includes("site") || v.includes("office")) return "onsite"
  return raw
}

function describeLocation(workplace: string | null, countries: string[]): string | null {
  const parts: string[] = []
  if (workplace) parts.push(workplace[0].toUpperCase() + workplace.slice(1))
  if (countries.length) parts.push(countries.join(", "))
  return parts.length ? parts.join(" · ") : null
}

/** Concatenate and unescape the Next.js RSC flight chunks embedded in the page. */
export function decodeFlight(html: string): string {
  const re = /self\.__next_f\.push\(\[1,"((?:[^"\\]|\\.)*)"\]\)/g
  let out = ""
  let m: RegExpExecArray | null
  while ((m = re.exec(html)) !== null) {
    try {
      out += JSON.parse(`"${m[1]}"`)
    } catch {
      // skip a malformed chunk rather than losing the whole payload
    }
  }
  return out
}

/** Index just past the value starting at `start` ({...} or [...]), honoring strings. -1 if unbalanced. */
function scanBalanced(s: string, start: number): number {
  let depth = 0
  let inStr = false
  for (let i = start; i < s.length; i++) {
    const c = s[i]
    if (inStr) {
      if (c === "\\") i++
      else if (c === '"') inStr = false
      continue
    }
    if (c === '"') inStr = true
    else if (c === "{" || c === "[") depth++
    else if (c === "}" || c === "]") {
      depth--
      if (depth === 0) return i + 1
    }
  }
  return -1
}

function strArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim() !== "") : []
}

function cardFromRecord(r: Record<string, unknown>): JobCard | null {
  const id = typeof r.id === "string" ? r.id : null
  const title = typeof r.title === "string" ? r.title.trim() : null
  const href = typeof r.href === "string" ? r.href : null
  if (!id || !title || !href) return null
  const workplace = normWorkplace(typeof r.workLocationType === "string" ? r.workLocationType : null)
  const countries = strArray(r.countries)
  return {
    id,
    title,
    company: COMPANY,
    location: describeLocation(workplace, countries),
    date: null,
    url: new URL(href, BASE_URL).toString(),
    category: typeof r.category === "string" && r.category ? r.category : null,
    workingHours: typeof r.workingHours === "string" && r.workingHours ? r.workingHours : null,
    workplace,
    countries,
    skills: strArray(r.skills),
  }
}

/**
 * Parse the job list from the careers page. Each job object in the RSC
 * `"jobs":[...]` array is sliced out and JSON-parsed on its own, so one
 * malformed entry cannot break the rest. Falls back to the HTML cards.
 */
export function parseJobList(html: string): JobCard[] {
  const flight = decodeFlight(html)
  const key = flight.indexOf('"jobs":[')
  if (key !== -1) {
    const arrStart = key + '"jobs":'.length
    const arrEnd = scanBalanced(flight, arrStart)
    const region = arrEnd === -1 ? flight.slice(arrStart) : flight.slice(arrStart, arrEnd)
    const cards: JobCard[] = []
    let i = 1
    while (i < region.length) {
      const objStart = region.indexOf("{", i)
      if (objStart === -1) break
      const objEnd = scanBalanced(region, objStart)
      if (objEnd === -1) break
      try {
        const card = cardFromRecord(JSON.parse(region.slice(objStart, objEnd)))
        if (card) cards.push(card)
      } catch {
        // malformed entry - skip it
      }
      i = objEnd
    }
    if (cards.length) return dedupe(cards)
  }
  return dedupe(parseHtmlCards(html))
}

/** Fallback: rendered <a href="/careers/<slug>-<id>"><h3>Title</h3><p>Hours | Workplace</p> cards. */
export function parseHtmlCards(html: string): JobCard[] {
  const cards: JobCard[] = []
  const chunks = html.split(/<a\b(?=[^>]*href="\/careers\/[a-z0-9-]+-a[0-9a-z]{14,17}")/i).slice(1)
  for (const chunk of chunks) {
    const href = chunk.match(/href="(\/careers\/[a-z0-9-]+-(a[0-9a-z]{14,17}))"/i)
    const h3 = chunk.match(/<h3[^>]*>([\s\S]*?)<\/h3>/i)
    if (!href || !h3) continue
    const meta = chunk.match(/<\/h3>\s*<p[^>]*>([\s\S]*?)<\/p>/i)
    const [hours, place] = meta ? clean(meta[1]).split("|").map((s) => s.trim()) : [null, null]
    const workplace = normWorkplace(place)
    cards.push({
      id: href[2],
      title: clean(h3[1]),
      company: COMPANY,
      location: describeLocation(workplace, []),
      date: null,
      url: new URL(href[1], BASE_URL).toString(),
      category: null,
      workingHours: hours || null,
      workplace,
      countries: [],
      skills: [],
    })
  }
  return cards
}

function dedupe(cards: JobCard[]): JobCard[] {
  const seen = new Set<string>()
  return cards.filter((c) => {
    const k = c.id.toLowerCase()
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
}

function fold(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
}

/** Every whitespace-separated query term must appear in title, category, or skills. */
export function matchesQuery(card: JobCard, query: string | undefined): boolean {
  if (!query) return true
  const hay = fold([card.title, card.category ?? "", ...card.skills].join(" | "))
  return fold(query)
    .split(/\s+/)
    .filter(Boolean)
    .every((t) => hay.includes(t))
}

/** Country filter: matches any listed country (accent/case-insensitive, prefix ok). */
export function matchesLocation(card: JobCard, location: string | undefined): boolean {
  if (!location) return true
  const want = fold(location.trim())
  if (!card.countries.length) return true // fallback cards carry no countries; don't drop them
  return card.countries.some((c) => fold(c).startsWith(want) || want.startsWith(fold(c)))
}

interface LdJobPosting {
  title?: string
  description?: string
  datePosted?: string
  employmentType?: string
  jobLocationType?: string
  applicantLocationRequirements?: { name?: string }[]
  jobLocation?: { address?: { addressLocality?: string; addressCountry?: string } }[]
  identifier?: { value?: string }
  experienceRequirements?: { monthsOfExperience?: number }
  jobBenefits?: string
  skills?: string[]
  workHours?: string
  url?: string
}

/** Find the schema.org JobPosting JSON-LD block on a detail page. */
export function findJobPostingLd(html: string): LdJobPosting | null {
  const re = /<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(html)) !== null) {
    try {
      const d = JSON.parse(m[1])
      const items = Array.isArray(d) ? d : [d]
      for (const it of items) if (it && it["@type"] === "JobPosting") return it as LdJobPosting
    } catch {
      // ignore unparsable blocks
    }
  }
  return null
}

/** Parse a detail page. Returns null when no JobPosting data is present. */
export function parseJobDetail(html: string, pageUrl: string): JobDetail | null {
  const ld = findJobPostingLd(html)
  if (!ld || !ld.title) return null
  const id = ld.identifier?.value ?? pageUrl.match(/-(a[0-9a-z]{14,17})\/?$/i)?.[1] ?? pageUrl
  const workplace =
    ld.jobLocationType === "TELECOMMUTE" ? "remote" : normWorkplace(html.match(/Fully_Remote|Hybrid|On_?Site/i)?.[0])
  const countries = (ld.applicantLocationRequirements ?? []).map((c) => c.name ?? "").filter(Boolean)
  const cities = [
    ...new Set(
      (ld.jobLocation ?? [])
        .map((p) => [p.address?.addressLocality, p.address?.addressCountry].filter(Boolean).join(", "))
        .filter(Boolean),
    ),
  ]
  const metaDesc = html.match(/<meta name="description" content="([^"]*)"/i)?.[1] ?? ""
  const seniority = decodeHtmlEntities(metaDesc).match(/\b([A-Z][a-z]+(?: [A-Z][a-z]+)?) level\b/)?.[1] ?? null
  const months = ld.experienceRequirements?.monthsOfExperience
  const url = ld.url ?? pageUrl
  return {
    id,
    title: clean(ld.title),
    company: COMPANY,
    location: describeLocation(workplace, countries),
    date: ld.datePosted ?? null,
    url,
    category: null,
    workingHours: ld.workHours ?? null,
    workplace,
    countries,
    skills: strArray(ld.skills),
    description: ld.description ? htmlToText(ld.description) : null,
    seniority,
    employmentType: ld.employmentType ?? null,
    experienceYears: typeof months === "number" ? Math.round((months / 12) * 10) / 10 : null,
    benefits: ld.jobBenefits ? htmlToText(ld.jobBenefits) : null,
    cities,
    applyUrl: url, // directApply: the application form is on the posting page itself
  }
}
