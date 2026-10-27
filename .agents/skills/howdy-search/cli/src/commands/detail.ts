import { BASE_URL, LIST_URL, htmlFetch, parseJobList, parseJobDetail, writeError } from "../helpers.js"

export interface DetailOpts {
  id: string
  format: "json" | "plain"
}

const HOWDY_HOST = /(^|\.)howdylatam\.com$/i
const ID_RE = /^a[0-9a-z]{14,17}$/i

/**
 * Resolve input to a posting URL. Accepts:
 *  - a full howdylatam.com /careers/<slug> URL (with or without scheme, any /es|/pt prefix)
 *  - a bare slug "backend-nodejs-developer-a1ztq00000jh6sk2ad"
 *  - a job id "a1ZTQ00000JH6sk2AD" (looked up in the listing, since detail URLs need the slug)
 * URLs on any other host are rejected.
 */
export async function resolveUrl(input: string): Promise<string | null> {
  const t = input.trim()
  const hasScheme = /^https?:\/\//i.test(t)
  if (hasScheme || /^[a-z0-9.-]+\.[a-z]{2,}\//i.test(t)) {
    let u: URL
    try {
      u = new URL(hasScheme ? t : `https://${t}`)
    } catch {
      return null
    }
    if (!HOWDY_HOST.test(u.hostname)) return null
    const p = u.pathname.match(/^\/(?:(?:en|es|pt)\/)?careers\/([a-z0-9-]+-a[0-9a-z]{14,17})\/?$/i)
    return p ? `${BASE_URL}/careers/${p[1].toLowerCase()}` : null
  }
  if (/^[a-z0-9-]+-a[0-9a-z]{14,17}$/i.test(t)) return `${BASE_URL}/careers/${t.toLowerCase()}`
  if (ID_RE.test(t)) {
    const list = parseJobList(await htmlFetch(LIST_URL))
    const hit = list.find((c) => c.id.toLowerCase() === t.toLowerCase())
    return hit ? hit.url : ""
  }
  return null
}

export async function runDetail(opts: DetailOpts): Promise<number> {
  try {
    const url = await resolveUrl(opts.id)
    if (url === null) {
      writeError(`Could not parse a Howdy job id, slug, or howdylatam.com URL from "${opts.id}"`, "BAD_ID")
      return 1
    }
    if (url === "") {
      writeError(`Job id "${opts.id}" is not on the current careers board (closed or removed)`, "NOT_FOUND")
      return 1
    }
    const html = await htmlFetch(url)
    const job = html ? parseJobDetail(html, url) : null
    if (!job) {
      writeError("Job not found", "NOT_FOUND")
      return 1
    }

    if (opts.format === "plain") {
      const lines = [
        job.title,
        `${job.company} · ${job.location || "—"}`,
        "",
        job.seniority ? `Seniority: ${job.seniority}` : "",
        job.employmentType ? `Employment: ${job.employmentType}` : "",
        job.experienceYears !== null ? `Experience: ${job.experienceYears}+ years` : "",
        job.date ? `Posted: ${job.date.slice(0, 10)}` : "",
        job.cities.length ? `Offices/hubs: ${job.cities.join("; ")}` : "",
        job.skills.length ? `Skills: ${job.skills.join(", ")}` : "",
        "",
        job.description || "(no description)",
        "",
        job.benefits ? job.benefits : "",
        "",
        `Apply: ${job.applyUrl}`,
      ]
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
