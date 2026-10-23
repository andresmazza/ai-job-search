import {
  ACTIVE_SITEMAP,
  SITEMAP_INDEX,
  htmlFetch,
  parseJobPage,
  parseJobUrl,
  parseSitemap,
  parseSitemapIndex,
  writeError,
} from "../helpers.js"

export interface DetailOpts {
  id: string
  format: "json" | "plain"
}

/**
 * Accept a numeric job id or a remote.io job URL. URLs on any other host are
 * rejected (real URL parsing, so look-alike hosts and userinfo tricks fail).
 */
export function normalizeInput(input: string): { id: string; url: string | null } | null {
  const trimmed = input.trim()
  if (/^\d{4,}$/.test(trimmed)) return { id: trimmed, url: null }
  const hasScheme = /^https?:\/\//i.test(trimmed)
  if (!hasScheme && !/^(www\.)?remote\.io\//i.test(trimmed)) return null
  let parsed: URL
  try {
    parsed = new URL(hasScheme ? trimmed : `https://${trimmed}`)
  } catch {
    return null
  }
  if (!/^(www\.)?remote\.io$/i.test(parsed.hostname)) return null
  const job = parseJobUrl(`https://remote.io${parsed.pathname.replace(/\/$/, "")}`)
  return job ? { id: job.id, url: job.url } : null
}

/** Find a job URL by id: active sitemap first, then the expired-job sitemaps. */
async function resolveUrl(id: string): Promise<string | null> {
  const find = (xml: string) => parseSitemap(xml).find((e) => e.id === id)?.url ?? null
  const active = await htmlFetch(ACTIVE_SITEMAP)
  const hit = active ? find(active) : null
  if (hit) return hit
  const index = await htmlFetch(SITEMAP_INDEX)
  for (const sm of parseSitemapIndex(index).filter((u) => /expired/i.test(u))) {
    const xml = await htmlFetch(sm)
    const found = xml ? find(xml) : null
    if (found) return found
  }
  return null
}

export async function runDetail(opts: DetailOpts): Promise<number> {
  const input = normalizeInput(opts.id)
  if (!input) {
    writeError(`Could not parse a Remote.io job id or URL from "${opts.id}"`, "BAD_ID")
    return 1
  }
  try {
    const url = input.url ?? (await resolveUrl(input.id))
    if (!url) {
      writeError(`Job ${input.id} not found in Remote.io's job sitemaps`, "NOT_FOUND")
      return 1
    }
    const html = await htmlFetch(url)
    const entry = parseJobUrl(url)!
    const job = html ? parseJobPage(html, entry) : null
    if (!job) {
      writeError(html ? "Job page has no JobPosting data (removed or markup changed)" : "Job not found", "NOT_FOUND")
      return 1
    }

    if (opts.format === "plain") {
      const lines = [
        job.title,
        `${job.company || "—"} · ${job.location || "—"}`,
        "",
        job.salary ? `Salary: ${job.salary}` : "",
        job.employmentType ? `Employment: ${job.employmentType}` : "",
        job.date ? `Posted: ${job.date}` : "",
        job.validThrough ? `Valid through: ${job.validThrough}` : "",
        `Status: ${job.isActive ? "ACTIVE" : "CLOSED / EXPIRED"}`,
        "",
        job.description || "(no description)",
        "",
        `URL: ${job.url}`,
      ].filter((l, i, arr) => l !== "" || (arr[i - 1] ?? "") !== "")
      process.stdout.write(lines.join("\n").replace(/\n{3,}/g, "\n\n") + "\n")
    } else {
      process.stdout.write(JSON.stringify(job, null, 2) + "\n")
    }
    return 0
  } catch (e) {
    writeError(e instanceof Error ? e.message : String(e), "DETAIL_FAILED")
    return 1
  }
}
