# Howdy careers board: URL & data reference

Investigated 2026-10-22. The entry point is the "Apply as Talent" link in the footer of `www.howdy.com`,
which goes to `https://howdylatam.com/oportunidades/`, which redirects to `https://www.howdylatam.com/careers`.

## Access

- `https://www.howdylatam.com/robots.txt`: `User-Agent: *` / `Allow: /`. Only the `/gracias` thank-you pages are disallowed.
- No login needed for the listing or the detail pages.
- `https://www.howdy.com/` (the marketing site) returned HTTP 429 to `Mozilla/5.0 (compatible; howdy-cli/1.0)`. The CLI never calls it.
- The candidate app at `app.howdy.com/login` requires login and isn't used.

## Endpoints

| Purpose | URL | Notes |
|---------|-----|-------|
| Listing | `GET https://www.howdylatam.com/careers` | All open jobs in one response (~24). No query, location, age, or page parameters, so filtering is client-side. |
| Detail | `GET https://www.howdylatam.com/careers/<slug>-<id-lowercase>` | e.g. `/careers/mid-security-engineer-a1ztq00000xuzx72ak`. `/es/careers/...` and `/pt/careers/...` also work. |
| Detail by bare id | none | `/careers/<id>` returns 404, so the CLI resolves the id to its slug through the listing. |

## Listing: response structure

A Next.js App Router page. The job list is embedded in the RSC flight payload:

```
<script>self.__next_f.push([1,"<JS-string-escaped chunk>"])</script>   (≈37 chunks)
```

Concatenate the JSON-unescaped chunks, then find the `"jobs":[` array (inside the component
props `{"heading":"Check Out Our Open Careers!","jobs":[...]}`). Each element:

| Field | Example | Maps to |
|-------|---------|---------|
| `id` | `a1ZTQ00000JH6sk2AD` (Salesforce id) | `id` |
| `title` | `Backend Node.js Developer` | `title` |
| `href` | `/careers/backend-nodejs-developer-a1ztq00000jh6sk2ad` | `url` (prefix with host) |
| `category` | `Engineering` / `Ops` / `Internal` | `category` |
| `workingHours` | `Full-Time` | `workingHours` |
| `workLocationType` | `Fully_Remote` / `Hybrid` | `workplace` (`remote` / `hybrid`) |
| `countries` | `["Argentina","Chile",...]` | `countries`, `location` |
| `state` | `""` | unused |
| `skills` | `["Node","React",...]` | `skills` (also searched by `--query`) |

There is no posting date and no client company name in the listing.

**HTML fallback** (used only when the flight payload is missing): each card is
`<a ... href="/careers/<slug>-<id>"><h3 ...>Title</h3><p ...>Full-Time<!-- --> | <!-- -->Fully_Remote</p>...`.

## Detail: response structure

`<script type="application/ld+json">` with `"@type":"JobPosting"`:

| Field | Notes |
|-------|-------|
| `title` | |
| `description` | HTML (`<ul><li>` lists, section labels as plain text) |
| `datePosted` | ISO 8601, the only source of the posting date |
| `employmentType` | `FULL_TIME` |
| `jobLocationType` | `TELECOMMUTE` for remote |
| `applicantLocationRequirements[].name` | eligible countries |
| `jobLocation[].address.addressLocality/addressCountry` | Howdy office hubs (same 10 for every job) |
| `identifier.value` | Salesforce id |
| `experienceRequirements.monthsOfExperience` | e.g. `36` |
| `jobBenefits` | HTML list |
| `skills` | array |
| `directApply` | `true`: the application form is on the page |
| `url` | canonical URL |

Seniority is only in `<meta name="description" content="Apply as X at Howdy. Senior level. Fully Remote - Full-Time. ...">`.
