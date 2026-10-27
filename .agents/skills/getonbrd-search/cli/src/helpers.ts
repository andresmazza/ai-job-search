// Data source: Get on Board (getonbrd.com), the Latin American tech job board.
//
//   - search: the public, unauthenticated JSON API `GET /api/v0/search/jobs`
//     (documented at https://www.getonbrd.com/api-doc.html). Each hit already
//     carries the full posting text, split into sections (projects, functions,
//     description, desirable, benefits) as HTML fragments.
//   - detail: `GET /api/v0/jobs/{id}` requires an API key (401 without one), so
//     detail reads the public job page instead (/jobs/<slug>) and parses its
//     schema.org microdata (itemprop="title", "datePosted", "description", ...).
//
// robots.txt sets no Disallow rules. No credentials are used or needed.

export const BASE = "https://www.getonbrd.com"
export const API = `${BASE}/api/v0`

const UA = "Mozilla/5.0 (compatible; getonbrd-cli/1.0)"

export function writeError(error: string, code: string): void {
  process.stderr.write(JSON.stringify({ error, code }) + "\n")
}

/** An HTTP error the API explained (e.g. a 422 with {message, code}). */
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message)
  }
}

/**
 * GET a URL with exponential backoff + jitter on 429/5xx (max 6 retries).
 * Returns null on 404/410. Other non-2xx statuses throw an ApiError carrying
 * the server's `message` when the body is the API's JSON error shape.
 */
export async function httpGet(url: string, accept: string): Promise<string | null> {
  const maxRetries = 6
  let delay = 500
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    let response: Response
    try {
      response = await fetch(url, {
        headers: { "User-Agent": UA, Accept: accept, "Accept-Language": "en-US,en;q=0.9,es;q=0.8" },
        redirect: "follow",
        signal: AbortSignal.timeout(20000),
      })
    } catch (e) {
      throw new Error(`could not reach getonbrd.com (${e instanceof Error ? e.message : String(e)})`)
    }
    if (response.status === 429 || response.status >= 500) {
      if (attempt === maxRetries) throw new ApiError(`Request failed: ${response.status} ${response.statusText}`, response.status)
      const jitter = Math.floor(Math.random() * 500)
      await new Promise((r) => setTimeout(r, delay + jitter))
      delay = Math.min(delay * 2, 8000)
      continue
    }
    if (response.status === 404 || response.status === 410) return null
    const body = await response.text()
    if (!response.ok) {
      let message = `Request failed: ${response.status} ${response.statusText}`
      try {
        const j = JSON.parse(body) as { message?: string }
        if (j.message) message = `getonbrd API: ${j.message}`
      } catch {
        // not JSON; keep the status line
      }
      throw new ApiError(message, response.status)
    }
    return body
  }
  throw new Error("Request failed after max retries")
}

// ---------------------------------------------------------------------------
// API types (only the fields this CLI reads)
// ---------------------------------------------------------------------------

interface Named {
  id: string
  type: string
  attributes?: { name?: string; country?: string }
}

export interface GobJob {
  id: string
  type: string
  links?: { public_url?: string }
  attributes: {
    title?: string | null
    description_headline?: string | null
    description?: string | null
    projects?: string | null
    functions_headline?: string | null
    functions?: string | null
    benefits_headline?: string | null
    benefits?: string | null
    desirable_headline?: string | null
    desirable?: string | null
    remote?: boolean
    remote_modality?: string | null
    countries?: string[]
    lang?: string | null
    category_name?: string | null
    min_salary?: number | null
    max_salary?: number | null
    published_at?: number | null
    applications_count?: number | null
    location_regions?: { data: Named[] }
    location_tenants?: { data: Named[] }
    location_cities?: { data: Named[] }
    modality?: { data: Named | null }
    seniority?: { data: Named | null }
    company?: { data: { id: string; attributes?: { name?: string } } | null }
  }
}

export interface JobResult {
  id: string
  title: string
  company: string | null
  location: string | null
  date: string | null
  url: string
  remoteModality: string | null
  /** Countries an applicant may live in (remote roles) or where the office is. */
  countries: string[]
  /** Regions an applicant may live in (remote roles), e.g. "South America". Union with `countries`. */
  regions: string[]
  seniority: string | null
  employmentType: string | null
  category: string | null
  salary: string | null
  lang: string | null
  applications: number | null
  description: string | null
}

// ---------------------------------------------------------------------------
// Text helpers
// ---------------------------------------------------------------------------

function numericEntity(cp: number): string {
  return cp >= 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : ""
}

// Named entities seen in Spanish / Portuguese postings, plus common punctuation.
const NAMED_ENTITIES: Record<string, string> = {
  lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", mdash: "—", ndash: "–", hellip: "…",
  laquo: "«", raquo: "»", ldquo: "“", rdquo: "”", lsquo: "‘", rsquo: "’", bull: "•", middot: "·",
  iexcl: "¡", iquest: "¿", ordf: "ª", ordm: "º", deg: "°", euro: "€", copy: "©", reg: "®", trade: "™",
  aacute: "á", eacute: "é", iacute: "í", oacute: "ó", uacute: "ú", Aacute: "Á", Eacute: "É",
  Iacute: "Í", Oacute: "Ó", Uacute: "Ú", ntilde: "ñ", Ntilde: "Ñ", uuml: "ü", Uuml: "Ü",
  agrave: "à", egrave: "è", ograve: "ò", acirc: "â", ecirc: "ê", ocirc: "ô", atilde: "ã",
  otilde: "õ", Atilde: "Ã", Otilde: "Õ", ccedil: "ç", Ccedil: "Ç",
}

export function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&([a-zA-Z]+);/g, (whole, name: string) => (name === "amp" ? whole : (NAMED_ENTITIES[name] ?? whole)))
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, dec) => numericEntity(parseInt(dec, 10)))
    .replace(/&#[xX]([0-9a-fA-F]+);/g, (_, hex) => numericEntity(parseInt(hex, 16)))
    .replace(/&amp;/g, "&")
}

/** HTML fragment -> readable text: list items become "- " lines, blocks become paragraphs. */
export function htmlToText(html: string | null | undefined): string {
  if (!html) return ""
  const text = html
    .replace(/<\s*(script|style)[^>]*>[\s\S]*?<\/\s*\1\s*>/gi, "")
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\s*li[^>]*>/gi, "\n- ")
    .replace(/<\/(p|div|ul|ol|h[1-6]|section)>/gi, "\n\n")
    .replace(/<[^>]+>/g, " ")
  return decodeHtmlEntities(text)
    .replace(/[ \t ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

/** Unix seconds -> YYYY-MM-DD (UTC), or null. */
export function unixToDate(ts: number | null | undefined): string | null {
  if (typeof ts !== "number" || !Number.isFinite(ts) || ts <= 0) return null
  return new Date(ts * 1000).toISOString().slice(0, 10)
}

// ---------------------------------------------------------------------------
// API job -> contract result
// ---------------------------------------------------------------------------

const names = (rel?: { data: Named[] }): string[] =>
  (rel?.data ?? []).map((n) => n.attributes?.name?.trim() ?? "").filter(Boolean)

export const REMOTE_MODES = new Set(["fully_remote", "remote_local", "temporarily_remote"])

/**
 * Human-readable location from the modality and the location relations:
 *   fully_remote  -> "Remote (anywhere)"
 *   remote_local  -> "Remote (Argentina, Chile, ...)" / "Remote (South America)"
 *   hybrid        -> "Hybrid · Santiago, Chile"
 *   no_remote     -> "On-site · Santiago, Chile"
 */
export function formatLocation(a: GobJob["attributes"]): string | null {
  const mode = a.remote_modality ?? null
  const tenants = names(a.location_tenants)
  const regions = names(a.location_regions)
  const cities = (a.location_cities?.data ?? [])
    .map((c) => [c.attributes?.name, c.attributes?.country].filter(Boolean).join(", "))
    .filter(Boolean)
  const countries = (a.countries ?? []).filter((c) => c && c !== "Remote")
  const place = cities.length ? cities.join(" / ") : countries.join(", ")

  if (mode === "fully_remote") return "Remote (anywhere)"
  if (mode && REMOTE_MODES.has(mode)) {
    // Eligibility is the UNION of regions and individual countries: a job with
    // regions [South America, Central America] and tenants [Mexico] is open to
    // all three (the page reads "South America, Central America or Mexico").
    const who = [...regions, ...tenants]
    const list = who.length ? who : countries
    return list.length ? `Remote (${list.join(", ")})` : "Remote"
  }
  if (mode === "hybrid") return place ? `Hybrid · ${place}` : "Hybrid"
  if (mode === "no_remote") return place ? `On-site · ${place}` : "On-site"
  return place || null
}

/** "USD 2300–2400/month" (Get on Board publishes gross monthly USD), or null. */
export function formatSalary(min: number | null | undefined, max: number | null | undefined): string | null {
  const lo = typeof min === "number" && min > 0 ? min : null
  const hi = typeof max === "number" && max > 0 ? max : null
  if (lo === null && hi === null) return null
  if (lo !== null && hi !== null) return lo === hi ? `USD ${lo}/month` : `USD ${lo}–${hi}/month`
  return `USD ${lo ?? hi}/month`
}

/** The posting's sections joined into one text, each under its own headline. */
export function composeDescription(a: GobJob["attributes"]): string | null {
  const sections: [string | null | undefined, string | null | undefined][] = [
    [null, a.projects],
    [a.functions_headline, a.functions],
    [a.description_headline, a.description],
    [a.desirable_headline, a.desirable],
    [a.benefits_headline, a.benefits],
  ]
  const parts = sections
    .map(([head, body]) => {
      const text = htmlToText(body)
      if (!text) return ""
      const h = head?.trim()
      return h ? `## ${h}\n${text}` : text
    })
    .filter(Boolean)
  return parts.length ? parts.join("\n\n") : null
}

export function jobUrl(slug: string): string {
  return `${BASE}/jobs/${slug}`
}

export function toResult(j: GobJob): JobResult {
  const a = j.attributes ?? {}
  const tenants = names(a.location_tenants)
  const countries = tenants.length ? tenants : (a.countries ?? []).filter((c) => c && c !== "Remote")
  return {
    id: j.id,
    title: decodeHtmlEntities(a.title ?? "").trim() || "(untitled)",
    company: a.company?.data?.attributes?.name?.trim() || null,
    location: formatLocation(a),
    date: unixToDate(a.published_at),
    url: j.links?.public_url || jobUrl(j.id),
    remoteModality: a.remote_modality ?? null,
    countries,
    regions: names(a.location_regions),
    seniority: a.seniority?.data?.attributes?.name ?? null,
    employmentType: a.modality?.data?.attributes?.name ?? null,
    category: a.category_name ?? null,
    salary: formatSalary(a.min_salary, a.max_salary),
    lang: a.lang && a.lang !== "lang_not_specified" ? a.lang : null,
    applications: typeof a.applications_count === "number" ? a.applications_count : null,
    description: composeDescription(a),
  }
}

// ---------------------------------------------------------------------------
// Input normalisation
// ---------------------------------------------------------------------------

const SLUG_RE = /^[a-z0-9][a-z0-9-]*[a-z0-9]$/i

/**
 * A job slug from a bare slug or a getonbrd.com job URL
 * (`/jobs/<slug>`, `/jobs/<category>/<slug>`, `/empleos/...`, `/vagas/...`).
 * URLs on any other host are rejected (real URL parsing, so look-alike hosts
 * and userinfo tricks fail).
 */
export function parseJobInput(input: string): string | null {
  const trimmed = input.trim()
  if (!trimmed) return null
  const hasScheme = /^https?:\/\//i.test(trimmed)
  if (hasScheme || /^(www\.)?getonbrd\.com\//i.test(trimmed)) {
    let parsed: URL
    try {
      parsed = new URL(hasScheme ? trimmed : `https://${trimmed}`)
    } catch {
      return null
    }
    if (!/^(www\.)?getonbrd\.(com|cl)$/i.test(parsed.hostname)) return null
    const m = parsed.pathname.replace(/\/+$/, "").match(/^\/(?:jobs|empleos|vagas)\/(?:[a-z0-9-]+\/)?([a-z0-9-]+)$/i)
    return m && SLUG_RE.test(m[1]) ? m[1].toLowerCase() : null
  }
  if (trimmed.includes("/") || trimmed.includes(".")) return null
  return SLUG_RE.test(trimmed) ? trimmed.toLowerCase() : null
}

// ---------------------------------------------------------------------------
// Job page (detail) parsing — schema.org microdata
// ---------------------------------------------------------------------------

export interface JobDetail {
  id: string
  title: string
  company: string | null
  location: string | null
  date: string | null
  url: string
  /** false when the page shows "Closed job - No longer accepting applications". */
  isActive: boolean
  seniority: string | null
  employmentType: string | null
  /** Header note such as "Requires applying in Spanish", when present. */
  applyNote: string | null
  remotePolicy: string | null
  countries: string[]
  skills: string[]
  salary: string | null
  description: string | null
}

function first(re: RegExp, html: string): string | null {
  const m = html.match(re)
  return m ? decodeHtmlEntities(m[1].replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim() || null : null
}

/** Parse a /jobs/<slug> page. Returns null when the page carries no job title. */
export function parseJobPage(html: string, slug: string): JobDetail | null {
  const title = first(/itemprop="title"[^>]*>([\s\S]*?)<\/span>/i, html)
  if (!title) return null

  const orgStart = html.indexOf('itemprop="hiringOrganization"')
  const org = orgStart >= 0 ? html.slice(orgStart, orgStart + 4000) : ""
  const company = first(/<strong[^>]*itemprop="name"[^>]*>([\s\S]*?)<\/strong>/i, org)

  const datetime = html.match(/<time[^>]*datetime="([^"]+)"[^>]*itemprop="datePosted"/i)?.[1] ?? null
  const date = datetime && /^\d{4}-\d{2}-\d{2}/.test(datetime) ? datetime.slice(0, 10) : null

  // The job header: from the title to the body. Pages also list "More open jobs"
  // / "Similar jobs" with their own location chips, so header fields are read
  // from this slice only.
  const titleAt = html.indexOf('itemprop="title"')
  let headerEnd = html.indexOf('id="job-body"', titleAt)
  if (headerEnd < 0) headerEnd = html.indexOf("results-item", titleAt)
  const header = html.slice(titleAt, headerEnd > 0 ? headerEnd : titleAt + 8000)

  // A closed posting keeps its page: "<i class="icon icon-archive"></i> <strong>Closed job</strong> - No longer accepting applications"
  const isActive = !/icon-archive|<strong>\s*Closed job\s*<\/strong>/i.test(header)

  // Location chip, minus its hidden tooltip text: "Remote (Argentina, Mexico or Costa Rica)" / "Santiago (Hybrid)".
  // A closed page has no chip; fall back to the jobLocation / jobLocationType microdata.
  const chip = header.match(/<span class="location">([\s\S]*?)<span class="mx-3">/i)?.[1] ?? null
  let location = chip
    ? htmlToText(chip.replace(/<div class="location-tooltip-content[\s\S]*?<\/div>/gi, "")).replace(/\s+/g, " ").trim() || null
    : null
  if (!location) {
    const locality = html.match(/content="([^"]+)" itemprop="addressLocality"/i)?.[1]
    const country = html.match(/content="([^"]+)" itemprop="addressCountry"/i)?.[1]
    const remote = /content="TELECOMMUTE" itemprop="jobLocationType"/i.test(html)
    location = [remote ? "Remote" : null, [locality, country].filter(Boolean).join(", ") || null].filter(Boolean).join(" · ") || null
  }
  const seniority = first(/itemprop="qualifications"[^>]*>([\s\S]*?)<\/span>/i, header)
  const employmentType = first(/itemprop="employmentType"[^>]*>([\s\S]*?)<\/span>/i, html)
  const applyNote = first(/ⓘ\s*<span[^>]*>([\s\S]*?)<\/span>/i, header)
  const countries = [
    ...html.matchAll(/itemprop="applicantLocationRequirements"[^>]*>\s*<meta content="([^"]+)" itemprop="name"/gi),
  ].map((m) => decodeHtmlEntities(m[1]).trim())

  const skillsStart = html.indexOf('itemprop="skills"')
  const skillsBlock = skillsStart >= 0 ? html.slice(skillsStart, html.indexOf("</div>", skillsStart)) : ""
  const skills = [...skillsBlock.matchAll(/class="gb-tags__item"[^>]*>([^<]+)</g)].map((m) =>
    decodeHtmlEntities(m[1]).trim(),
  )

  // Salary, when published: MonetaryAmount microdata (minValue / maxValue / unitText / currency).
  const num = (prop: string) => {
    const v = header.match(new RegExp(`content="([\\d.]+)" itemprop="${prop}"`, "i"))?.[1]
    return v ? Number(v) : null
  }
  const unit = header.match(/content="([A-Z]+)" itemprop="unitText"/)?.[1]?.toLowerCase() ?? "month"
  const currency = header.match(/content="([A-Z]{3})" itemprop="currency"/)?.[1] ?? "USD"
  const lo = num("minValue")
  const hi = num("maxValue")
  const salary =
    lo === null && hi === null
      ? null
      : `${currency} ${lo !== null && hi !== null && lo !== hi ? `${lo}–${hi}` : (lo ?? hi)}/${unit}`

  // Body: from id="job-body" up to the apply section that follows it.
  let description: string | null = null
  let remotePolicy: string | null = null
  const bodyStart = html.indexOf('id="job-body"')
  if (bodyStart >= 0) {
    const open = html.indexOf(">", bodyStart) + 1
    let end = html.indexOf('id="js-apply-section"', open)
    if (end < 0) end = html.indexOf('itemprop="skills"', open)
    if (end < 0) end = Math.min(html.length, open + 60000)
    // The marker is an attribute, so back up to the start of the tag that carries it.
    const tagStart = html.lastIndexOf("<", end)
    if (tagStart > open) end = tagStart
    const body = html.slice(open, end)
    // Perk boxes are icon tiles; keep their titles only (the text repeats the perk name).
    const cleaned = body.replace(/<span class="font-normal block mt-3 color-hierarchy2">[\s\S]*?<\/span>/g, "")
    description =
      htmlToText(cleaned.replace(/<h3[^>]*>/gi, "\n\n## ").replace(/<h2[^>]*>/gi, "\n\n## "))
        .replace(/^##\s*$/gm, "") // empty headings (the perks block has a blank <h3>)
        .replace(/\n{3,}/g, "\n\n")
        .trim() || null
    const policy = body.match(/<h2>\s*Remote work policy\s*<\/h2>([\s\S]*?)(?:<\/div>|$)/i)
    if (policy) remotePolicy = htmlToText(policy[1]).replace(/\s*\n+\s*/g, ". ") || null
  }

  return {
    id: slug,
    title,
    company,
    location,
    date,
    url: jobUrl(slug),
    isActive,
    seniority,
    employmentType,
    applyNote,
    remotePolicy,
    countries,
    skills,
    salary,
    description,
  }
}
