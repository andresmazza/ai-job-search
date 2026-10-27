# Get on Board — endpoint reference

Recorded 2026-10-27 while building this skill. Update this file when the portal changes.

## Access

- `https://www.getonbrd.com/robots.txt`: only a comment line, no Disallow rules.
- API reference: `https://www.getonbrd.com/api-doc.html` (Scalar UI) with the
  OpenAPI spec at `https://www.getonbrd.com/doc/openapi.yaml`.
- Search is public and unauthenticated. `GET /api/v0/jobs/{id}` returns
  **401 `{"message":"(Status 401) Unauthorized access.","code":"unauthorized"}`**
  without an API key, so `detail` uses the public HTML page instead.
- User-Agent: `Mozilla/5.0 (compatible; getonbrd-cli/1.0)`. It was accepted on every request.

## Search — `GET https://www.getonbrd.com/api/v0/search/jobs`

| Param | Used by CLI | Notes |
|-------|-------------|-------|
| `query` | `--query` | Full-text, relevance-ranked (not date-sorted). |
| `country_code` | `--location` | ISO 3166-1 alpha-2, case-insensitive. A name gives **422** "Country code should be an ISO 3166-1 alpha-2 code". An unknown code (`zz`) gives `data: []`. Includes remote jobs open to that country. |
| `remote` | never sent | `true` returns only `fully_remote`. Combined with `country_code` it gives **422** "Localization conflict. Do not pass country code and remote parameters at the same time." The CLI filters `remote_modality` client-side instead. |
| `page` | `--page` | 1-indexed. **A page past `total_pages` still returns data** (not an empty list), so the CLI returns `[]` when `page > total_pages`. |
| `per_page` | fixed 100 | Max 120. |
| `expand` | fixed | JSON array: `["company","location_cities","location_tenants","location_regions","seniority","modality"]`. Without it, relations are `{id,type}` only. |
| `lang` | fixed `en` | Response locale for names (`en`/`es`/`pt`). |
| `companies`, `featured`, `board_host` | no | Not needed. |

There is no date filter. `--jobage` filters on `published_at` client-side.

### Response

```
{ "data": [ { "id": "<slug>", "type": "job",
              "attributes": { ... },
              "links": { "public_url": "https://www.getonbrd.com/jobs/<slug>" } } ],
  "meta": { "page": 1, "per_page": 100, "total_pages": 2 } }
```

Attribute paths used:

| Field | Path | Notes |
|-------|------|-------|
| id | `data[].id` | Job slug; also the public URL path. |
| title | `attributes.title` | |
| company | `attributes.company.data.attributes.name` | needs `expand` company |
| date | `attributes.published_at` | Unix seconds → `YYYY-MM-DD` UTC |
| url | `links.public_url` | |
| modality | `attributes.remote_modality` | `fully_remote` / `remote_local` / `temporarily_remote` / `hybrid` / `no_remote` |
| eligible countries | `attributes.location_tenants.data[].attributes.name` | remote_local jobs |
| regions | `attributes.location_regions.data[].attributes.name` | e.g. "South America", "Central America". **Eligibility = regions ∪ countries**: a job with regions [South America, Central America] and tenants [Mexico] reads "South America, Central America or Mexico" on the page. `country_code=ar` matches it through the region. |
| cities | `attributes.location_cities.data[].attributes.{name,country}` | hybrid / on-site |
| countries | `attributes.countries` | `["Remote"]` for remote jobs, else office country |
| seniority | `attributes.seniority.data.attributes.name` | |
| employment | `attributes.modality.data.attributes.name` | "Full time" … |
| salary | `attributes.min_salary` / `max_salary` | gross USD/month, null when hidden |
| lang | `attributes.lang` | `en` / `es` / `pt` / `lang_not_specified` |
| text | `projects`, `functions(_headline)`, `description(_headline)`, `desirable(_headline)`, `benefits(_headline)` | HTML fragments |

## Detail — `GET https://www.getonbrd.com/jobs/<slug>`

`/jobs/<slug>` 301-redirects to `/jobs/<category>/<slug>`, and fetch follows it. 404 → `NOT_FOUND`.
There is no JSON-LD. The page uses schema.org **microdata**:

| Field | Anchor |
|-------|--------|
| title | `<span itemprop="title">…</span>` |
| company | inside `itemprop="hiringOrganization"`: `<strong itemprop="name">…</strong>` |
| date | `<time datetime="…" itemprop="datePosted">` |
| header region | from `itemprop="title"` to `id="job-body"`. **Read header fields only from here**: the page also lists "More open jobs" / "Similar jobs" cards with their own `class="location"` chips. |
| location | header `<span class="location">…` up to the first `<span class="mx-3">`; drop the hidden `<div class="location-tooltip-content hide">` |
| location fallback | `<meta content="…" itemprop="addressLocality">`, `itemprop="addressCountry"`, `<meta content="TELECOMMUTE" itemprop="jobLocationType">` |
| seniority | header `<span itemprop="qualifications">` |
| employment | `<span class="hide" itemprop="employmentType">FULL_TIME</span>` |
| salary | header `itemprop="baseSalary"`: `<span content="2100" itemprop="minValue">`, `maxValue`, `<span content="MONTH" itemprop="unitText">`, `<span content="USD" itemprop="currency">` |
| apply note | header `ⓘ <span class="size0">Requires applying in Spanish</span>` |
| closed | header `<i class="icon icon-archive"></i> <strong>Closed job</strong> - No longer accepting applications` → `isActive: false` (the closed page has no location chip, salary or job-body apply section) |
| eligible countries | `<span itemprop="applicantLocationRequirements" …><meta content="Argentina" itemprop="name">` |
| description | `<div id="job-body" itemprop="description">` up to the tag carrying `id="js-apply-section"` (fallback: `itemprop="skills"`). Section titles are `<h3 class="font-black mb2">`. The perks block has an empty `<h3>` and `<span class="font-normal block mt-3 color-hierarchy2">` blurbs, which are dropped. Ends with `<h2>Remote work policy</h2>`. |
| skills | `<div class="gb-tags" itemprop="skills">` → `<a class="gb-tags__item" …>PHP</a>` |
