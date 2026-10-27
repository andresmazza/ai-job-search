import { describe, expect, test } from "bun:test"
import {
  composeDescription,
  formatLocation,
  formatSalary,
  htmlToText,
  parseJobInput,
  parseJobPage,
  toResult,
  unixToDate,
  type GobJob,
} from "../src/helpers.ts"
import { buildSearchUrl, matchesRemote, toCountryCode, withinDays } from "../src/commands/search.ts"

// Shapes copied from live /api/v0/search/jobs responses (2026-10-27), trimmed.
const REMOTE_LOCAL: GobJob = {
  id: "senior-php-engineer-laravel-aws-improving-remote",
  type: "job",
  links: { public_url: "https://www.getonbrd.com/jobs/senior-php-engineer-laravel-aws-improving-remote" },
  attributes: {
    title: "Senior PHP Engineer ( Laravel + AWS)",
    projects: "<p>Overview</p><p>We are seeking a PHP Engineer.</p>",
    functions_headline: "Responsibilities",
    functions: "<ul><li>Design APIs using PHP &amp; Laravel.</li><li>Build AWS services.</li></ul>",
    description_headline: "Required Qualifications",
    description: "<ul><li>Deep PHP + Laravel experience.</li></ul>",
    remote_modality: "remote_local",
    countries: ["Remote"],
    lang: "en",
    category_name: "Programming",
    min_salary: null,
    max_salary: null,
    published_at: 1793115803,
    applications_count: 56,
    location_regions: { data: [] },
    location_cities: { data: [] },
    location_tenants: {
      data: [
        { id: "costa_rica", type: "country", attributes: { name: "Costa Rica" } },
        { id: "argentina", type: "country", attributes: { name: "Argentina" } },
      ],
    },
    seniority: { data: { id: "4", type: "seniority", attributes: { name: "Senior" } } },
    modality: { data: { id: "1", type: "modality", attributes: { name: "Full time" } } },
    company: { data: { id: "improving", attributes: { name: "Improving" } } },
  },
}

const HYBRID: GobJob = {
  id: "desarrollador-full-stack-grafton-latam-santiago",
  type: "job",
  attributes: {
    title: "Desarrollador Full Stack",
    remote_modality: "hybrid",
    countries: ["Chile"],
    lang: "lang_not_specified",
    min_salary: 2300,
    max_salary: 2400,
    published_at: 1792000000,
    location_cities: { data: [{ id: "1", type: "tenant_city", attributes: { name: "Santiago", country: "Chile" } }] },
    location_tenants: { data: [] },
    company: { data: null },
  },
}

describe("API job -> contract result", () => {
  test("remote_local job maps every contract field", () => {
    const r = toResult(REMOTE_LOCAL)
    expect(r).toMatchObject({
      id: "senior-php-engineer-laravel-aws-improving-remote",
      title: "Senior PHP Engineer ( Laravel + AWS)",
      company: "Improving",
      location: "Remote (Costa Rica, Argentina)",
      date: "2026-10-27",
      url: "https://www.getonbrd.com/jobs/senior-php-engineer-laravel-aws-improving-remote",
      remoteModality: "remote_local",
      countries: ["Costa Rica", "Argentina"],
      seniority: "Senior",
      employmentType: "Full time",
      salary: null,
      lang: "en",
      applications: 56,
    })
    expect(r.description).toContain("## Responsibilities\n- Design APIs using PHP & Laravel.")
    expect(r.description).toStartWith("Overview")
  })

  test("hybrid job: city location, salary, null company, unspecified lang -> null", () => {
    const r = toResult(HYBRID)
    expect(r.location).toBe("Hybrid · Santiago, Chile")
    expect(r.salary).toBe("USD 2300–2400/month")
    expect(r.company).toBeNull()
    expect(r.lang).toBeNull()
    expect(r.url).toBe("https://www.getonbrd.com/jobs/desarrollador-full-stack-grafton-latam-santiago")
    expect(r.countries).toEqual(["Chile"])
  })

  test("remote_local eligibility is regions + countries combined", () => {
    const r = toResult({
      id: "senior-ai-engineer-niuro-remote-b1c5",
      type: "job",
      attributes: {
        title: "Senior AI Engineer",
        remote_modality: "remote_local",
        countries: ["Remote"],
        location_tenants: { data: [{ id: "mexico", type: "country", attributes: { name: "Mexico" } }] },
        location_regions: {
          data: [
            { id: "central_america", type: "region", attributes: { name: "Central America" } },
            { id: "south_america", type: "region", attributes: { name: "South America" } },
          ],
        },
      },
    })
    expect(r.location).toBe("Remote (Central America, South America, Mexico)")
    expect(r.countries).toEqual(["Mexico"])
    expect(r.regions).toEqual(["Central America", "South America"])
  })

  test("formatLocation covers each modality", () => {
    expect(formatLocation({ remote_modality: "fully_remote" })).toBe("Remote (anywhere)")
    expect(
      formatLocation({ remote_modality: "remote_local", location_regions: { data: [{ id: "x", type: "region", attributes: { name: "South America" } }] } }),
    ).toBe("Remote (South America)")
    expect(formatLocation({ remote_modality: "no_remote", countries: ["Mexico"] })).toBe("On-site · Mexico")
    expect(formatLocation({ remote_modality: null })).toBeNull()
  })

  test("salary, dates and description helpers", () => {
    expect(formatSalary(1500, 1500)).toBe("USD 1500/month")
    expect(formatSalary(null, 3000)).toBe("USD 3000/month")
    expect(formatSalary(0, null)).toBeNull()
    expect(unixToDate(null)).toBeNull()
    expect(composeDescription({})).toBeNull()
    expect(htmlToText("<p>Hola&nbsp;mundo</p><ul><li>A &amp; B</li></ul>")).toBe("Hola mundo\n\n- A & B")
  })
})

describe("search helpers", () => {
  test("country names and codes", () => {
    expect(toCountryCode("Argentina")).toBe("ar")
    expect(toCountryCode("AR")).toBe("ar")
    expect(toCountryCode("México")).toBe("mx")
    expect(toCountryCode("Buenos Aires")).toBeNull()
  })

  test("never sends country_code together with remote (API answers 422)", () => {
    const url = new URL(buildSearchUrl({ query: "php", countryCode: "ar", remote: "remote", page: 2, includeDescription: true, format: "json" }))
    expect(url.searchParams.get("country_code")).toBe("ar")
    expect(url.searchParams.has("remote")).toBe(false)
    expect(url.searchParams.get("page")).toBe("2")
    expect(JSON.parse(url.searchParams.get("expand")!)).toContain("company")
  })

  test("remote modes and job age", () => {
    const r = toResult(REMOTE_LOCAL)
    expect(matchesRemote(r, "remote")).toBe(true)
    expect(matchesRemote(r, "anywhere")).toBe(false)
    expect(matchesRemote(toResult(HYBRID), "hybrid")).toBe(true)
    expect(matchesRemote(toResult(HYBRID), "onsite")).toBe(false)
    const now = Date.parse("2026-10-27T12:00:00Z")
    expect(withinDays("2026-10-20", 14, now)).toBe(true)
    expect(withinDays("2026-09-01", 14, now)).toBe(false)
    expect(withinDays(null, 14, now)).toBe(true)
  })
})

describe("detail input", () => {
  test("accepts slugs and getonbrd job URLs, rejects other hosts", () => {
    expect(parseJobInput("senior-php-engineer-laravel-aws-improving-remote")).toBe("senior-php-engineer-laravel-aws-improving-remote")
    expect(parseJobInput("https://www.getonbrd.com/jobs/programming/foo-bar-santiago-bd8c")).toBe("foo-bar-santiago-bd8c")
    expect(parseJobInput("getonbrd.com/empleos/foo-bar/")).toBe("foo-bar")
    expect(parseJobInput("https://getonbrd.com.evil.io/jobs/foo-bar")).toBeNull()
    expect(parseJobInput("https://boards.greenhouse.io/x/jobs/123456")).toBeNull()
    expect(parseJobInput("../etc/passwd")).toBeNull()
  })
})

// Trimmed from a live job page (2026-10-27): header, salary microdata, body, perks, remote policy.
const OPEN_PAGE = `
<div class="fake-hidden"><time datetime="2026-09-30T18:58:38+00:00" itemprop="datePosted"></time>
<span itemprop="jobLocation"><span itemprop="address"><meta content="Santiago" itemprop="addressLocality"><meta content="CL" itemprop="addressCountry"></span></span></div>
<h1><span itemprop="title">
Ingeniero Full-Stack Semi Senior Laravel React
</span></h1>
<div class="m0"><span class="hide" itemprop="employmentType">FULL_TIME</span>
<h2><span><span><span class="location"><span class="js-locations-tooltip"><span class="location-flag"></span>
<a class="color-inherit" href="/jobs/city/santiago">Santiago
</a><div class="location-tooltip-content hide">
This job is performed partly from home and partly at the office in:
<span>Santiago</span>
</div>
(Hybrid)
</span></span></span></span>
<span class="mx-3">|</span>
<span itemprop="qualifications">
Semi Senior
</span></h2></div>
<h3><span itemprop="baseSalary"><strong>$2100 - 2400</strong> USD/month
<span itemprop="value"><span content="2100" itemprop="minValue"></span><span content="2400" itemprop="maxValue"></span><span content="MONTH" itemprop="unitText"></span></span>
<span content="USD" itemprop="currency"></span></span></h3>
<div class="mt1">ⓘ
<span class="size0">
Requires applying in Spanish
</span></div>
<div class="my2 flex" itemprop="hiringOrganization"><h3><a href="/companies/rflex"><strong itemprop="name">rFlex.io</strong></a></h3></div>
<div id="job-body" itemprop="description"><div class="gb-rich-txt"><p>Buscamos un desarrollador &amp; l&iacute;der.</p></div>
<h3 class="font-black mb2">Requisitos</h3><div class="gb-rich-txt"><ul><li>Laravel</li><li>React</li></ul></div>
<h3 class="font-black mb2"></h3><div class="gb-fluid-boxes"><strong class="size1">
Flexible hours
</strong><span class="font-normal block mt-3 color-hierarchy2">Flexible schedule and freedom.</span></div>
<h2>Remote work policy</h2>
<p><strong class="size1">Hybrid</strong></p>
<p class="size0">This job is performed partly from home and partly at the office in Santiago (Chile).</p>
</div></div>
<div class="gb-container gb-container--medium" id="js-apply-section"><h3>Apply now</h3></div>
<div class="gb-tags" itemprop="skills"><a class="gb-tags__item" href="/jobs/tag/laravel">Laravel
</a><a class="gb-tags__item" href="/jobs/tag/react">React
</a></div>`

const CLOSED_PAGE = `
<time datetime="2025-10-20T20:39:48+00:00" itemprop="datePosted"></time>
<meta content="Santiago" itemprop="addressLocality"><meta content="CL" itemprop="addressCountry">
<h1><span itemprop="title">Ingeniero Full-Stack</span></h1>
<h3 class="size1"><i class="icon icon-archive"></i><strong>Closed job</strong> - No longer accepting applications</h3>
<ul><a class="color-hierarchy2 results-item" href="/jobs/programming/other-job"><span class="location">Elsewhere</span></a></ul>`

describe("job page parsing", () => {
  test("open job: header fields, salary, apply note, body text", () => {
    const d = parseJobPage(OPEN_PAGE, "ingeniero-full-stack-bd8c")!
    expect(d).toMatchObject({
      id: "ingeniero-full-stack-bd8c",
      title: "Ingeniero Full-Stack Semi Senior Laravel React",
      company: "rFlex.io",
      location: "Santiago (Hybrid)",
      date: "2026-09-30",
      url: "https://www.getonbrd.com/jobs/ingeniero-full-stack-bd8c",
      isActive: true,
      seniority: "Semi Senior",
      employmentType: "FULL_TIME",
      salary: "USD 2100–2400/month",
      applyNote: "Requires applying in Spanish",
      skills: ["Laravel", "React"],
    })
    expect(d.remotePolicy).toContain("Hybrid")
    expect(d.description).toContain("Buscamos un desarrollador & líder.")
    expect(d.description).toContain("## Requisitos\n\n- Laravel\n- React")
    expect(d.description).not.toContain("<")
    expect(d.description).not.toMatch(/^##\s*$/m)
    expect(d.description).not.toContain("Flexible schedule and freedom")
  })

  test("closed job: isActive false, location falls back to microdata, not the related-jobs list", () => {
    const d = parseJobPage(CLOSED_PAGE, "ingeniero-full-stack")!
    expect(d.isActive).toBe(false)
    expect(d.location).toBe("Santiago, CL")
    expect(d.date).toBe("2025-10-20")
  })

  test("page without a title -> null", () => {
    expect(parseJobPage("<html><body>Not found</body></html>", "x")).toBeNull()
  })
})
