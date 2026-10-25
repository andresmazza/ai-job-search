# Arquitectura: ai-job-search

Fork personal de una plantilla de Claude Code para gestionar una búsqueda de empleo:
scraping de portales, ranking de ofertas, CVs y cartas en LaTeX, preparación de entrevistas.
No hay servidor, base de datos ni frontend: el producto son especificaciones en markdown,
CLIs de portales y herramientas Python de apoyo.

## Componentes

| Ruta | Qué es | Lenguaje / runtime |
|---|---|---|
| `.claude/commands/*.md` | Comandos del ciclo de vida (`/setup`, `/scrape`, `/rank`, `/apply`, `/interview`, `/outcome`, `/expand`, `/upskill`, `/add-portal`, `/add-template`, `/reset`…). **Los markdown SON la implementación.** | Markdown |
| `.claude/skills/` | Skills de Claude Code (`job-application-assistant`, `job-scraper`, `upskill`) con frontmatter YAML | Markdown |
| `.claude/agents/` | Subagentes (`posting-fetcher`, `posting-scorer`, `application-reviewer`) | Markdown |
| `.claude/settings.json` | Permisos de Claude Code (allow/ask/deny) revisados uno a uno | JSON |
| `.agents/skills/<portal>-search/` | Un skill por portal de empleo: `SKILL.md` + `cli/` | TypeScript sobre **Bun** |
| `tools/` | Herramientas deterministas invocadas por los comandos (dedup de ofertas, estado de scrape/rank, guardas de seguridad, verificación de PDF/layout, conversión de salarios) | Python 3.10+ |
| `salary_lookup.py` | Consulta de salarios | Python |
| `cv/`, `cover_letters/` | Plantillas LaTeX (`lualatex` para el CV, `xelatex` para la carta) | LaTeX |
| `tests/` | Tests de las herramientas Python | `unittest` |
| `CLAUDE.md`, `AGENTS.md` | Perfil del candidato y puntero único para otros runtimes de agentes | Markdown |

## Principios

1. **Una sola fuente de verdad.** Las reglas viven en `.claude/`. No dupliques especificaciones
   en otro sitio ni crees capas de orquestación o wrappers que copien su lógica.
2. **Lo determinista va en `tools/`.** Si un comando describe en prosa algo que debe hacerse
   siempre igual (claves, deduplicación, validaciones), se implementa como herramienta Python
   pura y el markdown la invoca.
3. **Contrato de los CLIs de portal** (ver `/add-portal` y `linkedin-search` como referencia):
   - comandos `search` y `detail`;
   - `--format json|table|plain`;
   - errores como JSON por **stderr** (`{"error", "code"}`) y salida con código 1;
   - backoff exponencial con jitter ante 429/5xx y timeout en cada petición;
   - **cero dependencias de runtime** (sólo `typescript` y `@types/bun` como devDependencies);
   - sin scripts de ciclo de vida (`preinstall`, `postinstall`…) en `package.json`.
4. **Cada CLI es independiente**: su propio `package.json`, `tsconfig.json`, `src/` y `tests/`.
   No se comparte código entre portales.
5. **Las plantillas LaTeX deben compilar** y conservar su número exacto de páginas.

## Cómo se verifica (lo mismo que ejecuta la CI)

- `python3 tools/lint_skills.py` — frontmatter de skills, títulos de comandos, settings.json.
- `python3 tools/security_guards.py` — permisos, reglas de `.gitignore`, manifiestos.
- `python3 -m unittest discover -s tests -t .` — tests Python.
- En cada CLI tocado: `bun run typecheck` y `bun test`.
