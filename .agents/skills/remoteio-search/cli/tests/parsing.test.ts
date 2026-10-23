import { describe, expect, test } from "bun:test"
import {
  extractJobPosting,
  formatLocation,
  htmlToText,
  matchesQuery,
  parseJobPage,
  parseJobUrl,
  parseSitemap,
  parseSitemapIndex,
} from "../src/helpers.ts"
import { normalizeInput } from "../src/commands/detail.ts"
import { matchesLocation } from "../src/commands/search.ts"

const SITEMAP = `<?xml version="1.0"?><urlset>
  <url><loc>https://remote.io/remote-jobs/software-development/senior-full-stack-engineer-at-virtru-2093363</loc><lastmod>2026-10-18</lastmod></url>
  <url><loc>not a url</loc></url>
  <url><loc>https://remote.io/remote-jobs/customer-service/senior-customer-success-manager-ionq-2158839</loc><lastmod>2026-10-22</lastmod></url>
  <url><lastmod>2026-10-22</lastmod></url>
</urlset>`

describe("sitemap parsing", () => {
  test("parses valid entries and skips malformed ones", () => {
    const entries = parseSitemap(SITEMAP)
    expect(entries).toHaveLength(2)
    expect(entries[0]).toMatchObject({
      id: "2093363",
      category: "software-development",
      titleSlug: "senior-full-stack-engineer",
      companySlug: "virtru",
      lastmod: "2026-10-18",
    })
    // No "-at-" in the slug: the company is unknown until the job page is read.
    expect(entries[1].companySlug).toBeNull()
  })

  test("splits on the LAST -at- so titles containing 'at' survive", () => {
    const e = parseJobUrl("https://remote.io/remote-jobs/data/data-engineer-at-scale-at-acme-123456")!
    expect(e.titleSlug).toBe("data-engineer-at-scale")
    expect(e.companySlug).toBe("acme")
  })

  test("sitemap index lists active before expired job sitemaps", () => {
    const idx = `<sitemapindex>
      <sitemap><loc>https://remote.io/sitemap-expired-jobs-1.xml</loc></sitemap>
      <sitemap><loc>https://remote.io/sitemap-skills.xml</loc></sitemap>
      <sitemap><loc>https://remote.io/sitemap-active-jobs.xml</loc></sitemap></sitemapindex>`
    expect(parseSitemapIndex(idx)).toEqual([
      "https://remote.io/sitemap-active-jobs.xml",
      "https://remote.io/sitemap-expired-jobs-1.xml",
    ])
  })
})

describe("query matching", () => {
  const [entry] = parseSitemap(SITEMAP)
  test("every query word must appear in the slug", () => {
    expect(matchesQuery(entry, "Full-Stack")).toBe(true)
    expect(matchesQuery(entry, "senior full stack")).toBe(true)
    expect(matchesQuery(entry, "virtru")).toBe(true)
    expect(matchesQuery(entry, "full stack php")).toBe(false)
    expect(matchesQuery(entry, "sta")).toBe(false) // whole words, not substrings
  })
})

const PAGE = `<html><head>
<script type="application/ld+json">{"@context":"https://schema.org","@type":"Organization","name":"Remote.io"}</script>
<script type="application/ld+json" data-job-posting="true">{"@type":"JobPosting","title":"Backend Engineer &amp; API Lead","description":"<h3>About</h3><p>We build <a href=\\"x\\">things</a>.</p><ul><li>PHP</li><li>Laravel</li></ul>","datePosted":"2026-10-20T10:00:00.000Z","validThrough":"2099-01-01T00:00:00.000Z","hiringOrganization":{"name":"Acme"},"identifier":{"value":"123456"},"employmentType":"FULL_TIME","baseSalary":{"currency":"USD","value":{"minValue":60000,"maxValue":80000,"unitText":"YEAR"}},"applicantLocationRequirements":[{"@type":"Country","name":"Argentina"},{"@type":"Country","name":"Colombia"}],"jobLocationType":"TELECOMMUTE"}</script>
</head><body><div id="root"></div></body></html>`

describe("job page parsing", () => {
  const entry = parseJobUrl("https://remote.io/remote-jobs/software-development/backend-engineer-at-acme-123456")!

  test("prefers the data-job-posting JSON-LD block", () => {
    expect(extractJobPosting(PAGE)?.["@type"]).toBe("JobPosting")
  })

  test("builds a full record", () => {
    const job = parseJobPage(PAGE, entry)!
    expect(job.title).toBe("Backend Engineer & API Lead")
    expect(job.company).toBe("Acme")
    expect(job.location).toBe("Argentina; Colombia")
    expect(job.salary).toBe("USD 60,000–80,000/year")
    expect(job.isActive).toBe(true)
    expect(job.description).toBe("About\nWe build things.\n\n• PHP\n• Laravel")
  })

  test("returns null when the page has no JobPosting", () => {
    expect(parseJobPage("<html><div id=root></div></html>", entry)).toBeNull()
  })

  test("location falls back to jobLocation, then to a remote marker", () => {
    expect(formatLocation({ jobLocation: { address: { addressCountry: "US" } } })).toBe("US")
    expect(formatLocation({ applicantLocationRequirements: { name: "United States" } })).toBe("United States")
    expect(formatLocation({ jobLocationType: "TELECOMMUTE" })).toBe("Remote (no location restriction listed)")
    expect(formatLocation({})).toBeNull()
  })

  test("htmlToText decodes entities and keeps list items on their own lines", () => {
    expect(htmlToText("<p>A &amp; B</p><ul><li>one</li><li>two</li></ul><p>end</p>")).toBe("A & B\n\n• one\n• two\n\nend")
  })
})

describe("location filter", () => {
  const card = (location: string | null, title = "Engineer") => ({
    id: "1", title, company: null, location, date: null, url: "", category: null, salary: null,
  })
  test("substring and aliases", () => {
    expect(matchesLocation(card("Argentina; Colombia"), "argentina")).toBe(true)
    expect(matchesLocation(card("Brazil"), "latam")).toBe(true)
    expect(matchesLocation(card("United States"), "latam")).toBe(false)
    expect(matchesLocation(card(null, "Developer - LATAM Remote"), "latam")).toBe(true)
    expect(matchesLocation(card("Remote (no location restriction listed)"), "worldwide")).toBe(true)
  })
})

describe("detail input", () => {
  test("accepts ids and remote.io job URLs, rejects other hosts", () => {
    expect(normalizeInput("2093363")).toEqual({ id: "2093363", url: null })
    expect(normalizeInput("https://remote.io/remote-jobs/software-development/senior-full-stack-engineer-at-virtru-2093363/")?.id).toBe("2093363")
    expect(normalizeInput("remote.io/remote-jobs/data/x-at-y-123456")?.id).toBe("123456")
    expect(normalizeInput("https://boards.greenhouse.io/acme/jobs/2093363")).toBeNull()
    expect(normalizeInput("https://remote.io.evil.example/remote-jobs/data/x-123456")).toBeNull()
    expect(normalizeInput("https://remote.io@evil.example/remote-jobs/data/x-123456")).toBeNull()
  })
})
