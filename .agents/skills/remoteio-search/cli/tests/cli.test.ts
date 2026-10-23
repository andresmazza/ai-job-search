import { describe, expect, test } from "bun:test"
import { parseJSON, runCLI } from "./helpers.ts"

interface SearchOut {
  meta: { count: number; page: number }
  results: { id: string | null; title: string | null; company: string | null; location: string | null; date: string | null; url: string | null }[]
}

describe("live smoke test (low volume)", () => {
  test("search returns real results with the contract fields", async () => {
    const out = parseJSON<SearchOut>(await runCLI(["search", "-q", "full stack", "--limit", "2"]))
    expect(out.meta.page).toBe(1)
    expect(out.results.length).toBeGreaterThanOrEqual(1)
    for (const r of out.results) {
      expect(r.id).toBeTruthy()
      expect(r.title).toBeTruthy()
      expect(r.url).toStartWith("https://remote.io/remote-jobs/")
      for (const k of ["company", "location", "date"]) expect(k in r).toBe(true)
    }
  })

  test("--no-enrich makes a single sitemap request and still fills id/title/url", async () => {
    const out = parseJSON<SearchOut>(await runCLI(["search", "-q", "engineer", "--no-enrich", "--limit", "3"]))
    expect(out.results.length).toBeGreaterThanOrEqual(1)
    expect(out.results[0].location).toBeNull()
  })
})

describe("argument errors exit 1 with JSON on stderr", () => {
  const cases: [string, string[], string][] = [
    ["unknown flag", ["search", "-q", "x", "--bogus", "1"], "UNKNOWN_FLAG"],
    ["empty query", ["search", "-q", ""], "BAD_ARG"],
    ["bad jobage", ["search", "--jobage", "0.5"], "BAD_ARG"],
    ["no-enrich with location", ["search", "--no-enrich", "-l", "latam"], "BAD_ARG"],
    ["missing detail id", ["detail"], "NO_ID"],
    ["foreign URL", ["detail", "https://boards.greenhouse.io/x/jobs/123456"], "BAD_ID"],
    ["unknown command", ["frobnicate"], "BAD_CMD"],
  ]
  for (const [name, args, code] of cases) {
    test(name, async () => {
      const r = await runCLI(args)
      expect(r.exitCode).toBe(1)
      expect(r.stdout).toBe("")
      expect(JSON.parse(r.stderr).code).toBe(code)
    })
  }
})
