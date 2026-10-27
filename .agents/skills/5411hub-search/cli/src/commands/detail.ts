import { htmlFetch, parseJobInput, parseJobPage, writeError } from "../helpers.js"

export interface DetailOpts {
  id: string
  format: "json" | "plain"
}

export async function runDetail(opts: DetailOpts): Promise<number> {
  const input = parseJobInput(opts.id)
  if (!input) {
    writeError(`Could not parse a 5411 Hub job id or 5411hub.com/job-detail/ URL from "${opts.id}"`, "BAD_ID")
    return 1
  }
  try {
    const html = await htmlFetch(input.url)
    const job = html ? parseJobPage(html, input.id, input.url) : null
    if (!job) {
      // Unknown ids answer HTTP 200 with "El empleo no fue encontrado." and no job article.
      writeError(`Job ${input.id} not found (removed, never existed, or the page markup changed — see url-reference.md)`, "NOT_FOUND")
      return 1
    }

    if (opts.format === "plain") {
      const lines = [
        job.title,
        `${job.company} · ${job.location ?? "—"}`,
        "",
        job.jobType.length ? `Job type: ${job.jobType.join(", ")}` : "",
        job.languages.length ? `Languages: ${job.languages.join(", ")}` : "",
        job.skills.length ? `Skills: ${job.skills.join(", ")}` : "",
        job.categories.length ? `Category: ${job.categories.join(", ")}` : "",
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
