import { describe, expect, test } from "bun:test"
import { parseJSON, runCLI } from "./helpers.ts"

interface SearchOut {
  meta: { count: number; page: number }
  results: { id: string | null; title: string | null; company: string | null; location: string | null; date: string | null; url: string | null }[]
}

interface DetailOut {
  id: string
  title: string
  url: string
  isActive: boolean
  description: string | null
}

describe("live smoke test (low volume)", () => {
  test("search returns real results with the contract fields, then detail reads one", async () => {
    const out = parseJSON<SearchOut>(await runCLI(["search", "-q", "laravel", "--limit", "2", "--no-description"]))
    expect(out.meta.page).toBe(1)
    expect(out.results.length).toBeGreaterThanOrEqual(1)
    for (const r of out.results) {
      expect(r.id).toBeTruthy()
      expect(r.title).toBeTruthy()
      expect(r.url).toStartWith("https://www.getonbrd.com/jobs/")
      for (const k of ["company", "location", "date"]) expect(k in r).toBe(true)
    }

    const d = parseJSON<DetailOut>(await runCLI(["detail", out.results[0].url!]))
    expect(d.id).toBe(out.results[0].id!)
    expect(d.title).toBeTruthy()
    expect(typeof d.isActive).toBe("boolean")
    expect(d.description ?? "").not.toMatch(/<\/?[a-z][^>]*>/i)
  })
})

describe("argument errors exit 1 with JSON on stderr", () => {
  const cases: [string, string[], string][] = [
    ["unknown flag", ["search", "-q", "x", "--bogus", "1"], "UNKNOWN_FLAG"],
    ["empty query", ["search", "-q", ""], "BAD_ARG"],
    ["bad jobage", ["search", "--jobage", "0.5"], "BAD_ARG"],
    ["city as location", ["search", "-l", "Buenos Aires"], "BAD_ARG"],
    ["bad remote mode", ["search", "--remote", "sometimes"], "BAD_ARG"],
    ["bad format", ["search", "--format", "xml"], "BAD_ARG"],
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
