# Estilo de código

## Python (`tools/`, `salary_lookup.py`, `tests/`)

- **Sólo biblioteca estándar** (argparse, pathlib, json, re, subprocess…). No añadas
  dependencias de terceros: la única excepción existente es `openpyxl` para Excel, y `pyyaml`
  en el lint.
- Compatible con **Python 3.10 a 3.14** (la CI prueba todas) y con **Windows** (Git Bash, consola
  cp1252): usa `pathlib`, abre archivos con `encoding="utf-8"` explícito y no asumas que la
  consola acepta UTF-8.
- Cada herramienta empieza con un docstring de módulo que explica **el problema real que
  resuelve** (con ejemplos concretos que lo provocaron), el uso por línea de comandos y el
  significado de los códigos de salida.
- CLI con `argparse`; código de salida 0 = éxito, 1 = fallo o violaciones encontradas.
- Funciones puras y deterministas siempre que sea posible.

## Tests Python (`tests/test_<herramienta>.py`)

- `unittest` (no pytest). Un archivo por herramienta.
- Docstring de módulo que explica qué fallo real fijan los tests.
- Importan la herramienta añadiendo `tools/` a `sys.path`.
- **Reproduce el fallo por el camino real**: la entrada del test debe ser una que el flujo
  produce de verdad (salida real de un portal, un archivo de estado real, la invocación CLI
  documentada), no un valor construido a mano que el código nunca recibe.
- Sin red.

## TypeScript (`.agents/skills/*/cli/`)

- Runtime **Bun**, módulos ES (`"type": "module"`), sin dependencias de runtime.
- Usa `fetch` nativo con `AbortSignal.timeout(...)`.
- Parseo con regex cuando el markup es simple y estable; no añadas parsers DOM.
- Errores con el helper `writeError(error, code)` → JSON por stderr.
- Tests en `cli/tests/*.test.ts` con `bun test`, **sin red** (fixtures y mocks).
- `bun run typecheck` (`tsc --noEmit`) debe pasar.

## Markdown (`.claude/`)

- Los comandos empiezan con `# /<nombre>`.
- Los `SKILL.md` llevan frontmatter YAML válido; las rutas en `allowed-tools` deben existir.
- No dupliques reglas entre archivos: referencia el archivo canónico.

## Cambios

- Un único propósito por cambio. Nada de cambios "de paso" fuera del alcance.
- Si un cambio corrige un bug, incluye el test que falla sin el arreglo.
