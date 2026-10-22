# Search Queries for Job Scraper

## Installed portal CLIs (primary for `/scrape`)

`/scrape` discovers every portal skill under `.agents/skills/*/SKILL.md` and runs its CLI first. Shipped country-agnostic CLIs include `linkedin-search` and `freehire-search`; Danish demos and any skill you add with `/add-portal` are included the same way. You do **not** need a matching `site:` line below for those CLIs to run.

The Danish demo portals (Jobindex, Jobbank, Jobdanmark, Jobnet) stay **disabled**: the candidate's market is Argentina / remote. An Argentine or LatAm board (Bumeran, ZonaJobs, Computrabajo, Get on Board) can be added later with `/add-portal`.

The `site:` query templates in this file are the **WebSearch fallback** — for portals without a CLI, company career pages, or when a CLI fails.

**Language scope:** the candidate works in Spanish (native) and English (B1). Portuguese is basic only, so no Portuguese queries. Write each category in English and Spanish; Spanish titles are the common local equivalents, not literal translations. A posting requiring a language not declared is excluded; one requiring a higher English level (e.g. "fluent", C1) is flagged, not excluded — see `04-job-evaluation.md`'s Language Gate.

## Search Sites

Primary:
- **linkedin.com/jobs** - filter: Argentina / Buenos Aires, plus Remote (LatAm, US, Europe); also covered by `linkedin-search` CLI
- **getonbrd.com** - LatAm tech job board, many remote roles
- **bumeran.com.ar** / **zonajobs.com.ar** / **computrabajo.com.ar** - main Argentine general boards
- **weworkremotely.com** / **remoteok.com** - remote-first international boards

Secondary (company career pages via Google):
- Direct Google searches with `site:` filters for known target companies (technology companies)

## Query Categories

Queries are grouped by priority and organized by function, not exact job title.

### Priority 1: Senior Full Stack / Backend Engineering (PHP/Laravel, React)

Strongest and most desired direction.

```
site:linkedin.com/jobs "Senior Full Stack Engineer" Laravel React remote
site:linkedin.com/jobs "Senior Backend Engineer" PHP Laravel Argentina
site:linkedin.com/jobs "Senior PHP Developer" remote LatAm
site:getonbrd.com Laravel senior
site:getonbrd.com "Full Stack" PHP React
site:bumeran.com.ar "Desarrollador Full Stack" Senior PHP
site:computrabajo.com.ar "Desarrollador Backend" Laravel
site:weworkremotely.com Laravel
"Senior Laravel Developer" remote "Latin America" OR LatAm
```

### Priority 2: Tech Lead / Lead Engineer

Growth direction: architecture, mentoring, code reviews.

```
site:linkedin.com/jobs "Tech Lead" PHP OR Laravel remote
site:linkedin.com/jobs "Lead Software Engineer" Laravel React
site:getonbrd.com "Tech Lead" PHP
site:bumeran.com.ar "Líder Técnico" OR "Tech Lead" desarrollo
"Engineering Lead" Laravel remote LatAm
```

### Priority 3: Application Security / Security-minded Engineering

Adjacent pivot, backed by 2026 Google Cybersecurity certificate. Expect entry-level fit for pure security roles; best targets combine backend development with security.

```
site:linkedin.com/jobs "Application Security Engineer" PHP OR web remote
site:linkedin.com/jobs "Security Engineer" backend Argentina
site:linkedin.com/jobs "Junior Cybersecurity Analyst" OR "Analista de Ciberseguridad" Buenos Aires
site:getonbrd.com "AppSec" OR "Security Engineer"
"DevSecOps" Docker Kubernetes remote LatAm
```

### Priority 4: Broader Web Engineering (wider net)

```
site:linkedin.com/jobs "Senior Software Engineer" PHP remote
site:linkedin.com/jobs "Full Stack Developer" React Node.js remote LatAm
site:getonbrd.com "Senior Software Engineer" remote
site:bumeran.com.ar "Desarrollador Senior" PHP React
site:remoteok.com PHP
"Moodle Developer" OR "LMS Developer" remote
```

## Location Filter

The candidate lives in Buenos Aires and will not relocate.
- **Ideal:** fully remote (US, Europe, or LatAm company) with overlap with US Eastern / UTC-3 hours
- **Acceptable:** hybrid in CABA (Ciudad Autónoma de Buenos Aires)
- **Borderline:** hybrid in Gran Buenos Aires (GBA) outside CABA, depending on office days
- **Too far:** on-site roles outside the Buenos Aires metro area; remote roles restricted to US/EU residents or requiring Asia-Pacific hours; anything requiring relocation

## Language Filter

Your working languages and levels are in CLAUDE.md's Languages table. When filtering scraped results, apply `04-job-evaluation.md`'s Language Gate: a posting requiring a language you haven't declared at all is excluded; a posting requiring a higher level than you declared in a language you do work in is not excluded, flag it clearly instead (see `job-scraper/SKILL.md`'s Step 3 "Quick Fit Assessment" for how the flag surfaces in `/scrape` output). Postings simply *written* in a language you don't work in, that don't require it on the job, are fine. Note: "fluent English" and "professional Portuguese" requirements will be flagged against the candidate's B1 English and basic Portuguese.

## Salary Filter

Flag postings that state pay clearly below the candidate's baseline: ~USD 3,000/month for Argentina/LatAm roles, ~USD 4,000/month for US roles.

## Date Filter

Only include jobs posted within the last 14 days, or with an application deadline that has not yet passed. If a posting date cannot be determined, include it but flag as "date unknown".

## Adapting Queries

If the user specifies a focus area, select queries from the matching category and also generate 2-3 custom queries for that focus. For example:
- "/scrape tech lead" -> Priority 2 queries + custom tech-lead queries
- "/scrape security" -> Priority 3 queries + custom security queries
