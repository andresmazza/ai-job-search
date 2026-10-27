import { describe, expect, test } from "bun:test"
import { runCLI, parseJSON } from "./helpers"

interface SearchOut {
  meta: { count: number; page: number }
  results: { id: string; title: string; company: string | null; location: string | null; date: string | null; url: string }[]
}

describe("live search (smoke)", () => {
  test("search 'developer' returns jobs with id/title/url", async () => {
    const out = parseJSON<SearchOut>(await runCLI(["search", "-q", "developer", "--limit", "5"]))
    expect(out.meta.page).toBe(1)
    expect(out.results.length).toBeGreaterThanOrEqual(1)
    for (const r of out.results) {
      expect(r.id).toBeTruthy()
      expect(r.title).toBeTruthy()
      expect(r.url).toStartWith("https://www.howdylatam.com/careers/")
      for (const k of ["company", "location", "date"]) expect(k in r).toBe(true)
    }
  })

  test("detail on a search result returns a description", async () => {
    const list = parseJSON<SearchOut>(await runCLI(["search", "--limit", "1"]))
    const d = parseJSON<{ title: string; description: string | null; date: string | null }>(
      await runCLI(["detail", list.results[0].id]),
    )
    expect(d.title).toBe(list.results[0].title)
    expect(d.description?.length ?? 0).toBeGreaterThan(50)
    expect(d.description).not.toContain("<li>")
  })
})

describe("argument errors", () => {
  const isJsonError = (stderr: string) => {
    const e = JSON.parse(stderr)
    expect(typeof e.error).toBe("string")
    expect(typeof e.code).toBe("string")
  }

  test("bogus flag exits 1 with JSON error on stderr", async () => {
    const r = await runCLI(["search", "--bogus", "x"])
    expect(r.exitCode).toBe(1)
    expect(r.stdout).toBe("")
    isJsonError(r.stderr)
  })

  test("detail without id exits 1", async () => {
    const r = await runCLI(["detail"])
    expect(r.exitCode).toBe(1)
    isJsonError(r.stderr)
  })

  test("bad --remote value exits 1", async () => {
    const r = await runCLI(["search", "--remote", "onsite"])
    expect(r.exitCode).toBe(1)
    isJsonError(r.stderr)
  })

  test("non-howdy URL is rejected", async () => {
    const r = await runCLI(["detail", "https://example.com/careers/x-a1ztq00000xuzx72ak"])
    expect(r.exitCode).toBe(1)
    expect(JSON.parse(r.stderr).code).toBe("BAD_ID")
  })
})
