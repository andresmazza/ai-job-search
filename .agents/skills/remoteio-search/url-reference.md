# Remote.io URL Reference

Investigated 2026-10-23. Remote.io is a client-rendered single-page app (Vite/React):
search, category and listing pages return an empty `<div id="root">` shell with no
job data in the HTML. Only the sitemaps and the per-job pages carry server-side data.

## Access rules (robots.txt, 2026-10-23)

```
User-agent: *
Allow: /
Allow: /api/v2/jobs/*$        # single job JSON, but Turnstile-gated (see below)
Disallow: /api/v2/jobs/*/*
Disallow: /api/               # everything else under /api/, including search
Sitemap: https://remote.io/sitemap.xml
```

- `GET /api/v2/jobs/<id>` returns **403** `{"error":"Turnstile verification required","code":"turnstile_required","action":"public-api-admission"}`.
  The API is bot-protected: **do not use or try to bypass it.**
- No RSS/Atom feed: `/feed`, `/rss.xml` and `/remote-jobs/rss` return the SPA shell.
- The honest UA `Mozilla/5.0 (compatible; remoteio-cli/1.0)` is accepted on sitemaps and job pages.

## Search source: job sitemap

```
GET https://remote.io/sitemap-active-jobs.xml      (~1.1 MB, ~4,900 <url> entries)
```

```xml
<url>
  <loc>https://remote.io/remote-jobs/software-development/senior-full-stack-engineer-at-virtru-2093363</loc>
  <lastmod>2026-10-18</lastmod>
  <changefreq>daily</changefreq>
  <priority>1.0</priority>
</url>
```

URL anatomy: `/remote-jobs/<category>/<title-slug>[-at-<company-slug>]-<id>`

| Part | Notes |
|------|-------|
| `category` | e.g. `software-development` (~1,000), `devops-sysadmin`, `data`, `product`, `design`, `quality-assurance`, `other`, `sales-partnerships`, ... |
| `title-slug` | Title, lowercased, punctuation to `-`. Split at the **last** `-at-` |
| `company-slug` | Present in most slugs; sometimes the company is appended without `-at-` (e.g. `...-enablement-ionq-2158839`), so take company from JSON-LD |
| `id` | Numeric job id (4+ digits; currently 7) |
| `lastmod` | Date only; may lag `datePosted` by a day |

The sitemap index `https://remote.io/sitemap.xml` also lists `sitemap-expired-jobs-1.xml`
(and possibly `-2`, `-3` ...), used by `detail <id>` to find older postings. Other
sitemaps (`sitemap-skills.xml` with `/remote-jobs/<skill>/<region>` landing pages,
countries, cities, companies) point to SPA pages with no server-rendered listings.

## Detail source: job page JSON-LD

```
GET https://remote.io/remote-jobs/<category>/<slug>-<id>
```

- An id-only URL (`/remote-jobs/<category>/<id>`) returns 410, and a wrong slug redirects
  to `/remote-jobs`, so the full URL is needed (resolve it via the sitemap).
- Removed jobs return **410**.
- The `<head>` carries `<script type="application/ld+json" data-job-posting="true">`
  with a schema.org `JobPosting`:

| Field | Path | Notes |
|-------|------|-------|
| id | `identifier.value` | string |
| title | `title` | |
| company | `hiringOrganization.name` | |
| description | `description` | HTML (`<h3>`, `<p>`, `<ul><li>`, `<a>`) |
| posted | `datePosted` | ISO timestamp |
| expires | `validThrough` | ISO timestamp (~30 days after posting) |
| employment | `employmentType` | e.g. `FULL_TIME` |
| salary | `baseSalary.currency`, `baseSalary.value.{minValue,maxValue,unitText}` | optional |
| location | `applicantLocationRequirements` | **object or array** of `{ "@type": "Country"/..., "name": "Argentina" }` |
| location (fallback) | `jobLocation.address.addressCountry` | may be `null` |
| remote | `jobLocationType` | `TELECOMMUTE` |
| url | `url` | canonical page URL |

A second ld+json block (`Organization`, the site itself) precedes it; select the
`data-job-posting` block or the node whose `@type` is `JobPosting`.

There is no apply URL in the JSON-LD.
