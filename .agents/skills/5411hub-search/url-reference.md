# 5411 Hub — endpoint reference

Recorded 2026-10-27 while building this skill. Update this file when the site changes.

## Access

- `https://5411hub.com/robots.txt` (Yoast): `User-agent: * / Disallow:` (nothing disallowed).
- WordPress site (theme "emphires"). User-Agent `Mozilla/5.0 (compatible; 5411hub-cli/1.0)` was accepted.
- **Not used:**
  - `/wp-json/5411hub/v1/jobs`, `/jobs/search`, `/jobs/{id}` → **401** `jwt_auth_no_token`.
  - `/wp-json/wp/v2/awsm_job_openings` (public, 624 posts, with dates) is a **legacy** store.
    Its newest post is 2026-07-24 and its links (`/jobs/<slug>/`) are not the current board.
  - WP Job Manager (`/jm-ajax/get_listings/`, `/?feed=job_feed`, `/wp/v2/job-listings`)
    holds only expired 2020 theme demo data.
  - `/wp-json/5411hub-consumer/v1/jobs?page=&per_page=` (public, `per_page` capped at 30)
    returns the same cards as JSON-wrapped HTML but has **no search or filters**. It is
    a viable fallback if `/job-listing/` breaks.

## Search — `GET https://5411hub.com/job-listing/`

Server-rendered. The filter form `<form id="hub-jobs-filters" method="get">` submits:

| Param | CLI flag | Notes |
|-------|----------|-------|
| `search` | `--query` | Matches title and description. Multi-word queries behave like a phrase. |
| `location` | `--location` | **Term id**, from `<select name="location">` options (Argentina = 5, Colombia = 82, ...). Country-level only. |
| `job_type` | `--remote` | **Term id**, from `<select name="job_type">`: Remote = 12, Hybrid = 7, On-Site = 8 (also Contractor, Direct Hiring, Full Time, Part Timee, Freelance, AI, USD). |
| `skills`, `category` | not exposed | Term ids; 700+ / 190+ options. |
| `job_page` | `--page` | 1-indexed, 9 cards per page, newest (highest id) first. |

The CLI reads term ids from the form at runtime (one extra request when `--location` or
`--remote` is set). It never hard-codes them.

### Cards

Each card is `<a href="https://5411hub.com/job-detail/<slug>-<id>/" class="awsm-job-item">`:

| Field | Anchor |
|-------|--------|
| url / id | `href`; id = trailing number |
| title | `<h2 class="awsm-job-post-title">` |
| skills | `.awsm-job-specification-skills-needed .awsm-job-specification-terms` (`•`-separated) |
| category | `.awsm-job-specification-job-category …` |
| job type | `.awsm-job-specification-job-type …` |
| location | `.awsm-job-specification-job-location …` (region, or "Argentina • Capital Federal") |
| languages | `.awsm-job-specification-job-languages …` |
| card end | `awsm-job-more-container` |

Any of the specification items may be missing on a card.

### Pagination

`<div class="hub-pagination-wrapper">` with `<a href="/job-listing/?job_page=N">` links, and the
current page as `<span class="… hub-pagination-current"> N </span>` (not a link).
**An out-of-range `job_page` is served the last page.** Its links stop one short of the
total, so total = max(linked pages, current page), and the CLI returns `[]` when the
served page differs from the requested one.

## Detail — `GET https://5411hub.com/job-detail/<slug>-<id>/`

Only the trailing id matters: `/job-detail/10/` and `/job-detail/x-10/` return the same job.
An unknown id returns **HTTP 200** with "El empleo no fue encontrado." and no article.
There is no JSON-LD JobPosting (the Yoast graph describes the generic "Job Detail" page).

| Field | Anchor |
|-------|--------|
| container | `<article class="hub-job-detail-container">` … `</article>` |
| title | `<h1 class="hub-job-title">` |
| description | `<div class="hub-job-section hub-job-description">` up to `<div class="hub-job-meta">`. `<h3>` section titles; `<li><p>…</p></li>` lists |
| skills | `.hub-job-meta-item.hub-job-skills <span>` (comma-separated) |
| category | `.hub-job-meta-item.hub-job-category <span>` |
| job type | `.hub-job-meta-item.hub-job-type <span>` |
| location | `.hub-job-meta-item.hub-job-location <span>`, e.g. "Latin America, Argentina, Colombia, …" |
| languages | `.hub-job-meta-item.hub-job-languages <span>` |
| date | **none anywhere** |
| company | not shown (agency board); the CLI reports `5411 Hub` |
| apply | on-page form (`fhm-application…`), backed by `/wp-json/5411hub-consumer/v1/applications` (POST). Not used. |
