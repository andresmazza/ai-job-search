import { describe, expect, test } from "bun:test"
import {
  htmlToText,
  idFromUrl,
  parseCurrentPage,
  parseJobCards,
  parseJobInput,
  parseJobPage,
  parseSelectOptions,
  parseTotalPages,
  splitTerms,
} from "../src/helpers.ts"
import { buildListingUrl, resolveFilters, FilterValueError } from "../src/commands/search.ts"

// Trimmed from the live /job-listing/ page (2026-10-27).
const LISTING = `
<form method="get" action="" class="hub-jobs-filters-form" id="hub-jobs-filters">
<select name="job_type"><option value="">All Job Type</option>
<option value="2">
    Contractor   </option><option value="7">
    Hybrid   </option><option value="8">
    On-Site   </option><option value="12">
    Remote   </option></select>
<select name="location"><option value="">All Location</option>
<option value="5">
    Argentina   </option><option value="82">
    Colombia   </option></select>
</form>
<a href="https://5411hub.com/job-detail/cloud-devops-engineer-latam-global-operations-105/" class="awsm-job-item">
  <div class="awsm-grid-left-col"><h2 class="awsm-job-post-title">
     Cloud / DevOps Engineer | LATAM &amp; Global Operations </h2></div>
  <div class="awsm-grid-right-col"><div class="awsm-job-specification-wrapper">
   <div class="awsm-job-specification-item awsm-job-specification-skills-needed"><span class="awsm-job-specification-marker">▸</span>
     <span class="awsm-job-specification-terms"> Azure • Kubernetes • Linux </span></div>
   <div class="awsm-job-specification-item awsm-job-specification-job-type"><span class="awsm-job-specification-marker">▸</span>
     <span class="awsm-job-specification-terms"> Contractor • Full Time • Remote </span></div>
   <div class="awsm-job-specification-item awsm-job-specification-job-location"><span class="awsm-job-specification-marker">▸</span>
     <span class="awsm-job-specification-terms"> Latin America </span></div>
   <div class="awsm-job-specification-item awsm-job-specification-job-languages"><span class="awsm-job-specification-marker">▸</span>
     <span class="awsm-job-specification-terms"> Spanish (Native) • English (Advanced) </span></div>
  </div><div class="awsm-job-more-container"><span class="awsm-job-more">More Details</span></div></div>
</a>
<a href="https://5411hub.com/job-detail/broken-card/" class="awsm-job-item"><h2 class="awsm-job-post-title">No id</h2></a>
<a href="https://5411hub.com/job-detail/back-end-developers-php-senior-y-semi-senior-fintech-64/" class="awsm-job-item">
  <div class="awsm-grid-left-col"><h2 class="awsm-job-post-title">Back End Developers PHP Senior y Semi Senior | Fintech</h2></div>
  <div class="awsm-grid-right-col"><div class="awsm-job-specification-wrapper">
   <div class="awsm-job-specification-item awsm-job-specification-job-type"><span class="awsm-job-specification-terms"> Direct Hiring </span></div>
  </div><div class="awsm-job-more-container"></div></div>
</a>
<div class="hub-pagination-wrapper"><span class="hub-pagination-link hub-pagination-number hub-pagination-current"> 1 </span>
<a href="/job-listing/?job_page=2">2</a><a href="/job-listing/?job_page=11">11</a></div>`

describe("listing parsing", () => {
  test("cards: fields parsed, malformed card skipped, missing specs -> null/[]", () => {
    const cards = parseJobCards(LISTING)
    expect(cards).toHaveLength(2)
    expect(cards[0]).toEqual({
      id: "105",
      title: "Cloud / DevOps Engineer | LATAM & Global Operations",
      company: "5411 Hub",
      location: "Latin America",
      date: null,
      url: "https://5411hub.com/job-detail/cloud-devops-engineer-latam-global-operations-105/",
      skills: ["Azure", "Kubernetes", "Linux"],
      categories: [],
      jobType: ["Contractor", "Full Time", "Remote"],
      languages: ["Spanish (Native)", "English (Advanced)"],
    })
    expect(cards[1]).toMatchObject({ id: "64", location: null, jobType: ["Direct Hiring"], languages: [] })
  })

  test("pagination: linked pages and the current page both count", () => {
    expect(parseTotalPages(LISTING)).toBe(11)
    expect(parseCurrentPage(LISTING)).toBe(1)
    // An out-of-range request is served the last page, whose links stop at 10.
    const last = `<a href="/job-listing/?job_page=10">10</a><span class="hub-pagination-current"> 11 </span>`
    expect(parseTotalPages(last)).toBe(11)
    expect(parseTotalPages("<p>no pagination</p>")).toBe(1)
  })

  test("filter names resolve to the form's term ids", () => {
    expect(parseSelectOptions(LISTING, "location").get("argentina")).toBe("5")
    expect(resolveFilters(LISTING, { location: "argentina", remote: "onsite", page: 1, format: "json" })).toEqual({
      location: "5",
      jobType: "8",
    })
    expect(() => resolveFilters(LISTING, { location: "Buenos Aires", page: 1, format: "json" })).toThrow(FilterValueError)
  })

  test("listing URL", () => {
    expect(buildListingUrl({ page: 1 })).toBe("https://5411hub.com/job-listing/")
    expect(buildListingUrl({ search: "php laravel", location: "5", jobType: "12", page: 2 })).toBe(
      "https://5411hub.com/job-listing/?search=php+laravel&location=5&job_type=12&job_page=2",
    )
  })
})

// Trimmed from a live /job-detail/ page (2026-10-27).
const DETAIL = `
<div class="cspt-tbar"><h1 class="cspt-tbar-title"> Job Detail</h1></div>
<article class="hub-job-detail-container">
  <header class="hub-job-header"><h1 class="hub-job-title">Back End Senior y Semi Senior PHP (Laravel)</h1></header>
  <div class="hub-job-content">
    <div class="hub-job-section hub-job-description">
<p>Desde 5411 Hub buscamos un Back End Developer para una Fintech l&iacute;der.</p>
<h3>Requisitos</h3>
<ul><li><p>+3 a&ntilde;os con PHP.</p></li><li><p>Dominio de Laravel.</p></li></ul>
    </div>
    <div class="hub-job-meta">
      <div class="hub-job-meta-item hub-job-skills"><p class="hub-job-meta-text"><strong>Skills needed:</strong> <span>Developer, Laravel, PHP</span></p></div>
      <div class="hub-job-meta-item hub-job-type"><p class="hub-job-meta-text"><strong>Job Type:</strong> <span>Direct Hiring, Full Time, Hybrid</span></p></div>
      <div class="hub-job-meta-item hub-job-location"><p class="hub-job-meta-text"><strong>Location:</strong> <span>Argentina, Capital Federal</span></p></div>
      <div class="hub-job-meta-item hub-job-languages"><p class="hub-job-meta-text"><strong>Languages:</strong> <span>
            English (Advanced), Spanish (Native)    </span></p></div>
    </div>
  </div>
</article>`

describe("detail parsing", () => {
  test("article fields and readable description", () => {
    const d = parseJobPage(DETAIL, "10", "https://5411hub.com/job-detail/10/")!
    expect(d).toMatchObject({
      id: "10",
      title: "Back End Senior y Semi Senior PHP (Laravel)",
      company: "5411 Hub",
      location: "Argentina, Capital Federal",
      date: null,
      skills: ["Developer", "Laravel", "PHP"],
      categories: [],
      jobType: ["Direct Hiring", "Full Time", "Hybrid"],
      languages: ["English (Advanced)", "Spanish (Native)"],
    })
    expect(d.description).toBe(
      "Desde 5411 Hub buscamos un Back End Developer para una Fintech líder.\n\n## Requisitos\n\n- +3 años con PHP.\n- Dominio de Laravel.",
    )
  })

  test("not-found page (HTTP 200, no article) -> null", () => {
    expect(parseJobPage(`<div id="primary"> El empleo no fue encontrado. </div>`, "9999", "x")).toBeNull()
  })

  test("ids and inputs", () => {
    expect(idFromUrl("https://5411hub.com/job-detail/%f0%9f%9a%80-lead-generation-gtm-manager-108/")).toBe("108")
    expect(parseJobInput("105")).toEqual({ id: "105", url: "https://5411hub.com/job-detail/105/" })
    expect(parseJobInput("https://5411hub.com/job-detail/cloud-devops-105/")?.id).toBe("105")
    expect(parseJobInput("5411hub.com/job-detail/cloud-devops-105")?.id).toBe("105")
    expect(parseJobInput("https://5411hub.com.evil.io/job-detail/x-105/")).toBeNull()
    expect(parseJobInput("https://boards.greenhouse.io/x/jobs/123456")).toBeNull()
    expect(parseJobInput("cloud-devops")).toBeNull()
  })

  test("text helpers", () => {
    expect(splitTerms(" A • B , C ")).toEqual(["A", "B", "C"])
    expect(htmlToText("<p>x</p><h3></h3><p>y</p>")).toBe("x\n\ny")
  })
})
