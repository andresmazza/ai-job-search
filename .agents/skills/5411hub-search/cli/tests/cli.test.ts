import { describe, expect, test } from "bun:test"
import { parseJSON, runCLI } from "./helpers.ts"

interface SearchOut {
  meta: { count: number; page: number }
  results: { id: string | null; title: string | null; company: string | null; location: string | null; date: string | null; url: string | null }[]
}

describe("live smoke test (low volume)", () => {
  test("search returns real results with the contract fields, then detail reads one", async () => {
    const out = parseJSON<SearchOut>(await runCLI(["search", "-q", "php", "--limit", "2"]))
    expect(out.meta.page).toBe(1)
    expect(out.results.length).toBeGreaterThanOrEqual(1)
    for (const r of out.results) {
      expect(r.id).toMatch(/^\d+$/)
      expect(r.title).toBeTruthy()
      expect(r.url).toStartWith("https://5411hub.com/job-detail/")
      for (const k of ["company", "location", "date"]) expect(k in r).toBe(true)
    }

    const d = parseJSON<{ id: string; title: string; description: string | null }>(await runCLI(["detail", out.results[0].id!]))
    expect(d.id).toBe(out.results[0].id!)
    expect(d.title).toBe(out.results[0].title!)
    expect(d.description ?? "").not.toMatch(/<\/?[a-z][^>]*>/i)
  })
})

describe("argument errors exit 1 with JSON on stderr", () => {
  const cases: [string, string[], string][] = [
    ["unknown flag", ["search", "-q", "x", "--bogus", "1"], "UNKNOWN_FLAG"],
    ["jobage is unsupported", ["search", "--jobage", "14"], "UNKNOWN_FLAG"],
    ["empty query", ["search", "-q", ""], "BAD_ARG"],
    ["bad remote mode", ["search", "--remote", "sometimes"], "BAD_ARG"],
    ["bad page", ["search", "--page", "0"], "BAD_ARG"],
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
