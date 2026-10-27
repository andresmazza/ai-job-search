import { describe, expect, test } from "bun:test"
import { parseJobList, parseJobDetail, matchesQuery, matchesLocation } from "../src/helpers"

// Synthetic fixture shaped like the live page (RSC flight chunks, verified 2026-10-22).
function flightPage(jobsJson: string): string {
  const payload = `["$","$L25",null,{"heading":"Open Careers","jobs":${jobsJson}}]`
  return `<html><script>self.__next_f.push([1,${JSON.stringify(payload)}])</script></html>`
}

const GOOD = {
  id: "a1ZTQ00000JH6sk2AD",
  title: "Backend Node.js Developer",
  href: "/careers/backend-nodejs-developer-a1ztq00000jh6sk2ad",
  category: "Engineering",
  workingHours: "Full-Time",
  workLocationType: "Fully_Remote",
  countries: ["Argentina", "México"],
  state: "",
  skills: ["Node", "React"],
}

describe("parseJobList", () => {
  test("parses jobs from the flight payload", () => {
    const cards = parseJobList(flightPage(JSON.stringify([GOOD])))
    expect(cards).toHaveLength(1)
    expect(cards[0]).toMatchObject({
      id: GOOD.id,
      title: GOOD.title,
      company: "Howdy.com",
      date: null,
      workplace: "remote",
      url: "https://www.howdylatam.com/careers/backend-nodejs-developer-a1ztq00000jh6sk2ad",
    })
  })

  test("one entry without required fields does not break the rest", () => {
    const cards = parseJobList(flightPage(JSON.stringify([{ id: "x" }, GOOD])))
    expect(cards.map((c) => c.id)).toEqual([GOOD.id])
  })

  test("falls back to HTML cards when no flight payload", () => {
    const html = `<a class="x" href="/careers/data-engineer-a1ztq00000jh6sz2ad"><h3 class="t">Data Engineer</h3><p class="m">Full-Time<!-- --> | <!-- -->Hybrid</p></a>`
    const cards = parseJobList(html)
    expect(cards).toHaveLength(1)
    expect(cards[0]).toMatchObject({ title: "Data Engineer", workplace: "hybrid", workingHours: "Full-Time" })
  })
})

describe("filters", () => {
  const [card] = parseJobList(flightPage(JSON.stringify([GOOD])))
  test("query terms match title or skills", () => {
    expect(matchesQuery(card, "react node")).toBe(true)
    expect(matchesQuery(card, "php")).toBe(false)
  })
  test("location is accent- and case-insensitive", () => {
    expect(matchesLocation(card, "mexico")).toBe(true)
    expect(matchesLocation(card, "Peru")).toBe(false)
  })
})

describe("parseJobDetail", () => {
  test("reads JSON-LD JobPosting", () => {
    const ld = {
      "@type": "JobPosting",
      title: "Mid Security Engineer",
      description: "Desired Skills:<ul><li>3+ years &amp; more</li><li>AWS</li></ul>",
      datePosted: "2026-09-15T12:00:00.000Z",
      employmentType: "FULL_TIME",
      jobLocationType: "TELECOMMUTE",
      applicantLocationRequirements: [{ name: "Argentina" }],
      identifier: { value: "a1ZTQ00000xUzX72AK" },
      experienceRequirements: { monthsOfExperience: 36 },
      url: "https://www.howdylatam.com/careers/mid-security-engineer-a1ztq00000xuzx72ak",
    }
    const html = `<meta name="description" content="Apply as X at Howdy. Mid level. Fully Remote"/><script type="application/ld+json">${JSON.stringify(ld)}</script>`
    const d = parseJobDetail(html, ld.url)!
    expect(d.id).toBe("a1ZTQ00000xUzX72AK")
    expect(d.date).toBe(ld.datePosted)
    expect(d.seniority).toBe("Mid")
    expect(d.experienceYears).toBe(3)
    expect(d.description).toBe("Desired Skills:\n- 3+ years & more\n- AWS")
  })

  test("returns null without JobPosting data", () => {
    expect(parseJobDetail("<html></html>", "https://www.howdylatam.com/careers/x")).toBeNull()
  })
})
