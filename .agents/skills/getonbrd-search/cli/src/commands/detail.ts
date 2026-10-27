import { httpGet, jobUrl, parseJobInput, parseJobPage, writeError } from "../helpers.js"

export interface DetailOpts {
  id: string
  format: "json" | "plain"
}

// The API's /api/v0/jobs/{id} needs an API key, so detail reads the public job
// page (/jobs/<slug>) and parses its schema.org microdata.
export async function runDetail(opts: DetailOpts): Promise<number> {
  const slug = parseJobInput(opts.id)
  if (!slug) {
    writeError(`Could not parse a Get on Board job slug or getonbrd.com job URL from "${opts.id}"`, "BAD_ID")
    return 1
  }
  try {
    const html = await httpGet(jobUrl(slug), "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8")
    if (html === null) {
      writeError(`Job "${slug}" not found (removed or never existed)`, "NOT_FOUND")
      return 1
    }
    const job = parseJobPage(html, slug)
    if (!job) {
      writeError(`Job page for "${slug}" has no job title (closed, redirected, or markup changed — see url-reference.md)`, "NOT_FOUND")
      return 1
    }

    if (opts.format === "plain") {
      const lines = [
        job.title,
        `${job.company ?? "—"} · ${job.location ?? "—"}`,
        "",
        job.isActive ? "" : "Status: CLOSED (no longer accepting applications)",
        job.date ? `Posted: ${job.date}` : "",
        job.seniority ? `Seniority: ${job.seniority}` : "",
        job.employmentType ? `Employment: ${job.employmentType}` : "",
        job.salary ? `Salary: ${job.salary}` : "",
        job.applyNote ? `Note: ${job.applyNote}` : "",
        job.remotePolicy ? `Remote policy: ${job.remotePolicy}` : "",
        job.countries.length ? `Applicants from: ${job.countries.join(", ")}` : "",
        job.skills.length ? `Skills: ${job.skills.join(", ")}` : "",
        `URL: ${job.url}`,
        "",
        job.description ?? "(no description)",
      ].filter((l, i, a) => l !== "" || (i > 0 && a[i - 1] !== ""))
      process.stdout.write(lines.join("\n") + "\n")
    } else {
      process.stdout.write(JSON.stringify(job, null, 2) + "\n")
    }
    return 0
  } catch (e) {
    writeError(e instanceof Error ? e.message : String(e), "DETAIL_FAILED")
    return 1
  }
}
