# Guía de instalación en Claude Code

Guía en español para instalar y usar este framework (AI Job Search) dentro de
[Claude Code](https://claude.com/claude-code). Es una traducción práctica de
[`SETUP.md`](SETUP.md) y [`README.md`](README.md), con el detalle de qué se
registra en Claude Code al instalar el repo.

---

## 0. Idea clave (qué significa "instalar" aquí)

En Claude Code **no hay un paso de "instalar skills"**: las skills, los slash
commands, los subagentes y los permisos se **auto-descubren** desde el
directorio del proyecto. "Instalar" = poner el repo en disco y ejecutar
`claude` desde su raíz.

El mapa de lo que se activa al hacer eso:

| Ruta del repo | Qué se registra en Claude Code |
|---|---|
| `.claude/skills/job-application-assistant/` | Skill principal (`SKILL.md` + metodología `01..09-*.md`) |
| `.claude/skills/job-scraper/`, `.claude/skills/upskill/` | Skills de búsqueda de empleo y de análisis de brechas de skills |
| `.claude/commands/*.md` | Slash commands: `/setup`, `/apply`, `/scrape`, `/rank`, `/outcome`, `/interview`, `/expand`, `/upskill`, `/html-report`, `/add-template`, `/add-portal`, `/notion-sync`, `/gmail-sync`, `/reset` |
| `.claude/agents/*.md` | Subagentes: `posting-fetcher`, `posting-scorer`, `application-reviewer` |
| `.claude/settings.json` | Permisos `allow` / `ask` / `deny` (qué puede hacer el agente sin preguntarte) |
| `.agents/skills/*/` | Skills de portales de empleo (formato Agent Skills, portable a Codex/Antigravity) + CLIs en TypeScript |
| `CLAUDE.md` | Memoria del proyecto: tu perfil de candidato y las reglas del workflow |
| `tools/`, `salary_lookup.py` | Utilidades Python que el agente invoca vía Bash |
| `cv/`, `cover_letters/`, `templates/` | Plantillas LaTeX (CV moderncv, carta `cover.cls`) |

> **Alternativa (no recomendada):** copiar solo
> `.claude/skills/job-application-assistant/` a `~/.claude/skills/` para
> tenerla global. Funciona como skill aislada, pero el workflow **se rompe**:
> los comandos, las plantillas, `tools/` y los permisos viven en rutas
> relativas al repo (`tools/posting_guard.py`, `cv/main_example.tex`,
> `cover_letters/cover_<empresa>_<puesto>.tex`). Instala el repo completo.

---

## 1. Requisitos previos

### Claude Code

```bash
npm install -g @anthropic-ai/claude-code
```

Necesitas una suscripción Claude Pro/Max/Team o créditos de API de Anthropic.
Consulta la [documentación de Claude Code](https://docs.anthropic.com/en/docs/claude-code).

### Python 3.10+

```bash
python3 --version
```

En Windows suele ser `py --version` el comando más fiable. Si tu sistema expone
Python como `python` en vez de `python3`, sustituye en todos los comandos.

### Bun (para las CLIs de búsqueda de empleo)

Las CLIs de portales (cuatro daneses más `linkedin-search` y
`freehire-search`, agnósticos de país) están escritas en TypeScript y se
ejecutan con Bun.

```bash
# macOS / Linux
curl -fsSL https://bun.sh/install | bash
```

```powershell
# Windows PowerShell
powershell -ExecutionPolicy Bypass -c "irm https://bun.sh/install.ps1 | iex"
```

En Windows también vale `winget install Oven-sh.Bun`.

### LaTeX (para compilar CV y carta de presentación)

Instala una distribución de LaTeX:

- **Windows:** [MiKTeX](https://miktex.org/download)
- **macOS:** [MacTeX](https://tug.org/mactex/)
- **Linux:** `sudo apt install texlive-full` o `sudo dnf install texlive-scheme-full`

Se usan **dos compiladores distintos**, y no es opcional:

- **CV → `lualatex`** (`pdflatex` suele fallar en MiKTeX moderno con errores de
  expansión de fuentes de `fontawesome5`).
- **Carta → `xelatex`** (porque `cover.cls` requiere `fontspec` para sus
  fuentes propias Lato/Raleway).

#### Instalación mínima de TeX: TinyTeX / BasicTeX

Las distribuciones completas funcionan out of the box, pero las mínimas
necesitan unos paquetes extra para que compilen las plantillas de serie.

macOS (sin `sudo`):

```bash
curl -fsSL https://yihui.org/tinytex/install-bin-unix.sh -o /tmp/tinytex-install-bin-unix.sh
sh /tmp/tinytex-install-bin-unix.sh /tmp --no-path
export PATH="$HOME/Library/TinyTeX/bin/universal-darwin:$PATH"
```

El `export` solo vive en esa terminal. Persístelo o cada terminal nueva dará
`zsh: command not found: lualatex` aunque TinyTeX esté instalado:

```bash
echo 'export PATH="$HOME/Library/TinyTeX/bin/universal-darwin:$PATH"' >> ~/.zshrc
source ~/.zshrc
lualatex --version   # debe imprimir una versión, no "command not found"
```

(Bash: usa `~/.bash_profile` en lugar de `~/.zshrc`.)

Después instala las dependencias de las plantillas:

```bash
tlmgr install \
  moderncv fontawesome5 fontawesome6 academicons import luatexbase pgf \
  titlesec textpos xltxtra xunicode cite realscripts needspace
```

Para BasicTeX/MacTeX, asegúrate de que el directorio de binarios de TeX está en
`PATH` (por ejemplo vía `/Library/TeX/texbin`) y ejecuta el mismo
`tlmgr install ...`.

#### Windows: Basic MiKTeX

El instalador completo de MiKTeX trae todos los paquetes de CTAN y funciona
out of the box, pero el instalador pequeño
([Basic MiKTeX](https://miktex.org/download), `basic-miktex-*.exe`) incluye un
conjunto mínimo y necesita dos ajustes de una vez:

```powershell
initexmf --admin --set-config-value=[MPM]AutoInstall=1
initexmf --set-config-value=[MPM]AutoInstall=1
```

(La primera línea es para una instalación "para todos los usuarios" y pide
PowerShell como administrador; la segunda cubre la instalación por usuario.
Ejecutar las dos no hace daño.)

Si prefieres no depender de instalaciones bajo demanda (por ejemplo, para
compilar sin red más adelante), preinstala el mismo conjunto de paquetes:

```powershell
mpm --admin --install=moderncv --install=fontawesome5 --install=fontawesome6 --install=academicons --install=import --install=luatexbase --install=pgf --install=titlesec --install=textpos --install=xltxtra --install=xunicode --install=cite --install=realscripts --install=needspace
```

Quita `--admin` si MiKTeX está instalado solo para tu usuario. Si un nombre de
paquete no resuelve, `mpm --find=<nombre>` busca el correcto.

#### Pruebas rápidas de humo

```bash
cd cv && lualatex -interaction=nonstopmode -halt-on-error main_example.tex && cd ..

SMOKE_DIR="$(mktemp -d /tmp/ai-job-cover-smoke.XXXXXX)"
cp -R cover_letters/cover.cls cover_letters/OpenFonts "$SMOKE_DIR/"
cat >"$SMOKE_DIR/cover_smoke.tex" <<'EOF'
\documentclass[]{cover}
\begin{document}
\namesection{Test}{Candidate}{test@example.com}
\companyname{Example Company}
\companyaddress{123 Hiring Street\\Example City}
\currentdate{\today}
\lettercontent{Dear Hiring Manager,}
\lettercontent{This smoke test verifies that xelatex can load cover.cls and the bundled fonts.}
\closing{Sincerely,}
\signature{Test Candidate}
\end{document}
EOF
(cd "$SMOKE_DIR" && xelatex -interaction=nonstopmode -halt-on-error cover_smoke.tex)
```

### Opcional: extracción de texto para el chequeo ATS

`/apply` hace un chequeo de parseabilidad ATS sobre el CV compilado: extrae la
capa de texto del PDF y verifica datos de contacto, orden de lectura y
cobertura de keywords tal como lo vería un applicant-tracking system.

El extractor por defecto es **pypdf** (BSD, `pip install pypdf`). Poppler
`pdftotext` queda como alternativa opcional:

- **macOS:** `brew install poppler`
- **Debian/Ubuntu:** `sudo apt install poppler-utils`
- **Windows:** `choco install poppler`

Si un comando sigue usando `pdftotext -layout`, debe pasar también
`-enc UTF-8`. Si **no hay ninguno de los dos extractores**, `/apply` omite el
chequeo mecánico con un aviso y hace una revisión visual de keywords; el resto
funciona igual.

---

## 2. Obtener el repo

### Opción A — repositorio privado (recomendado para tu propia búsqueda de empleo)

**Motivo:** un fork de un repo público **siempre es público** (GitHub no permite
forks privados), y `/setup` escribe tu nombre, datos de contacto, historial
laboral y expectativas salariales en **archivos versionados**. Si los subes a
un fork, los publicas.

```bash
# 1. Crea un repositorio vacío y PRIVADO en GitHub (tu cuenta)
# 2. Clona el upstream y apunta origin a tu repo privado
git clone https://github.com/MadsLorentzen/ai-job-search.git ai-job-search
cd ai-job-search
git remote rename origin upstream
git remote add origin https://github.com/<tu-usuario>/<tu-repo-privado>.git
```

### Opción B — fork público (solo si quieres contribuir al proyecto)

```bash
gh repo fork MadsLorentzen/ai-job-search --clone
cd ai-job-search
gh repo set-default <tu-usuario-github>/ai-job-search
```

O manualmente: haz el fork en GitHub y luego clona tu fork.

> [!IMPORTANT]
> La línea `gh repo set-default` **no es opcional**. `gh repo fork --clone`
> deja el repo **upstream** como repositorio por defecto de `gh` ("The
> `upstream` remote will be set as the default remote repository" — `gh repo
> fork --help`), y `gh` usa ese valor por defecto para **crear issues y PRs**.
> Sin corregirlo, cualquier `gh issue create` posterior desde este clon — por
> ti o por un agente al que le pidas seguimiento de postulaciones — acabaría
> publicando en el tracker **público** de upstream, con tu identidad de
> GitHub, en un repo donde no puedes borrarlo (#389).

> [!WARNING]
> **Los forks son públicos.** GitHub no puede hacer privado el fork de un
> repositorio público, y `/setup` escribe tus datos personales en ficheros
> **tracked**: subir esos commits a un fork los publica. Si esta copia es para
> tu propia búsqueda de empleo y no para contribuir, usa un **repositorio
> privado** con este repo como `upstream` (opción A). Todo lo demás de esta
> guía funciona igual en ambos casos.

---

## 3. Instalar las dependencias de las CLIs de portales

Desde la raíz del repositorio:

```bash
python3 tools/install_portal_clis.py   # Windows: python tools\install_portal_clis.py
```

El script ejecuta `bun install` en cada CLI de portal bajo
`.agents/skills/*/cli/` — se **descubren**, no están en una lista, así que un
portal que añadas con `/add-portal` o copies de otro fork se incluye también en
un clon nuevo. Una CLI cuyo `package.json` declare un script de lifecycle en
tiempo de instalación se omite y se reporta, en lugar de ejecutarse.
`--dry-run` muestra qué haría.

Para `linkedin-search` y `freehire-search` la instalación es opcional: ambas
tienen cero dependencias de runtime y funcionan con `bun` a secas; `bun
install` solo baja los tipos de TypeScript de desarrollo.

Si estás fuera de Dinamarca, puedes generar un skill de búsqueda equivalente
para tu portal local con `/add-portal`: crea la misma estructura de CLI para
cualquier portal público y prueba una consulta en vivo antes de registrarlo.

---

## 4. Arrancar Claude Code y personalizar el perfil

```bash
claude
```

Y dentro de Claude Code:

```
/setup
```

Claude ofrece tres caminos (los detecta solo y pregunta):

- **Path A (carpeta `documents/`):** deja tu CV (PDF o `.tex`), export de
  LinkedIn, diplomas, cartas de referencia y postulaciones anteriores en
  `documents/cv/`, `documents/linkedin/`, `documents/diplomas/`,
  `documents/references/`, `documents/applications/`. Claude los lee y los
  cruza antes de proponer cambios en el perfil. Es lo mejor si tienes varios
  ficheros de partida. Es idempotente: puedes relanzarlo a medida que añadas
  material (ver `documents/README.md`).
- **Path B (import de un CV):** comparte un CV con `@` o pegando el texto.
  Claude lo extrae y hace preguntas de seguimiento para lo que falte.
- **Path C (modo entrevista):** responde a preguntas estructuradas sección por
  sección.

Los tres caminos producen el mismo resultado: ficheros de perfil completos.

### Qué se rellena

| Fichero | Contenido |
|---|---|
| `CLAUDE.md` | Tu perfil completo de candidato |
| `01-candidate-profile.md` | Educación, experiencia y skills estructuradas |
| `02-behavioral-profile.md` | Autoevaluación conductual (PI/DISC) |
| `03-writing-style.md` | Tono, estructura y do's/don'ts de escritura |
| `04-job-evaluation.md` | Framework de scoring de encaje + metas de carrera |
| `05-cv-templates.md` | Plantillas de "profile statement" según tu perfil |
| `06-cover-letter-templates.md` | Reglas de la carta de presentación |
| `07-interview-prep.md` | Ejemplos STAR + framework de entrevista |
| `08-application-forms.md` | Guía de formularios de aplicación |
| `09-web-research.md` | Guía de investigación web de empresas |
| `cv/main_example.tex` | Tu CV en LaTeX con tus datos reales |
| `.claude/skills/job-scraper/search-queries.md` | Queries de búsqueda para `/scrape` |

### Reejecutar el setup

Puedes actualizar secciones concretas más adelante:

```
/setup --section skills
/setup --section experience
/setup --section search
```

`--section search` es especialmente útil a medida que evolucionan tus
prioridades: vuelve a pasar la entrevista de configuración de búsqueda y
sugiere tipos de rol que igual no habías considerado.

---

## 5. Opcional: benchmarking salarial

Si tienes datos salariales (de un sindicato, una encuesta de salarios,
Glassdoor o investigación personal):

1. **Opción A:** crea `salary_data.json` a mano en la raíz del repo (el
   formato está en `tools/README_SALARY_TOOL.md`).
2. **Opción B:** conviértelo desde Excel:

   ```bash
   pip install openpyxl
   python3 tools/convert_salary_excel.py ruta/salarios.xlsx --source "Mis datos salariales 2025"
   ```

Esto genera `salary_data.json`, que usa el workflow `/apply` para el
benchmarking salarial. Si te lo saltas, el salary lookup simplemente se omite.

---

## 6. Probar el workflow

Busca una oferta que te interese y lanza:

```
/apply https://jobindex.dk/job/1234567
```

O pega la descripción directamente:

```
/apply [pega aquí el texto de la oferta]
```

Claude hará:

1. Evaluar el encaje contra tu perfil
2. Preguntar si quieres continuar
3. Redactar un CV y una carta de presentación adaptados
4. Pedir a un agente revisor que critique los borradores
5. Revisar y presentar el resultado final

Antes de nada, la oferta pasa una **puerta de integridad determinista**
(texto oculto, caracteres invisibles, líneas con forma de instrucción,
enlaces ocultos) y su veredicto de una línea abre la evaluación. Además,
`/apply` compila e inspecciona ambos PDFs (CV de exactamente 2 páginas, carta
de 1 con la firma visible) y hace el chequeo ATS sobre la capa de texto.

Para buscar ofertas en varios portales:

```
/scrape
```

Y para puntuar en lote todas las postulaciones nuevas antes de elegir:

```
/rank
```

---

## 7. Compilar tus documentos

Después de que `/apply` cree los ficheros LaTeX:

```bash
# Bash / zsh / Git Bash
cd cv && lualatex main_<empresa>_<puesto>.tex && cd ..
cd cover_letters && xelatex cover_<empresa>_<puesto>.tex && cd ..
```

```powershell
# PowerShell
Set-Location cv; lualatex main_<empresa>_<puesto>.tex; Set-Location ..
Set-Location cover_letters; xelatex cover_<empresa>_<puesto>.tex; Set-Location ..
```

Estos comandos aplican a las plantillas de serie (CV moderncv, carta
`cover.cls`). Si prefieres usar tu propia plantilla LaTeX, ejecuta
`/add-template`: captura el motor de compilación, las fuentes, las reglas de
estilo y el límite de páginas, hace una compilación de prueba y la cablea en
`/apply`.

---

## 8. Traer actualizaciones de upstream

Upstream sigue mejorando los ficheros de metodología que tu fork ha
personalizado, así que conviene planear las actualizaciones desde el día uno:

> **Prefiere releases sobre `master` a secas.** Las
> [releases](https://github.com/MadsLorentzen/ai-job-search/releases) etiquetadas
> son puntos de control verificados, cada uno descrito en
> [`CHANGELOG.md`](CHANGELOG.md). Trae los tags con `git fetch upstream --tags`
> y fusiona una release (p. ej. `git merge v1.0.0`) cuando quieras estabilidad;
> tira de `master` directamente solo si quieres lo último sin revisar. Los
> pasos siguientes valen igual en ambos casos.

1. **Commitea tu personalización — pero Ten claro dónde acaban esos commits.**
   `/setup` edita `CLAUDE.md` y los ficheros de perfil in situ; esos cambios
   son **tuyos**, y commitearlos es lo que permite que las actualizaciones
   apliquen limpiamente. Pero un **fork de este repo es público** (los forks de
   repos públicos no pueden ser privados), así que cualquier cosa que
   commitees *y subas* a un fork es visible para cualquiera. Si quieres tu
   perfil en algún remoto, no lo subas a un fork: crea un **repositorio
   privado**, sube ahí y añade este repo como remote `upstream` para seguir
   recibiendo actualizaciones. Commitear en local sin subir también vale. Los
   ficheros realmente sensibles (tracker, datos salariales, `documents/`,
   archivos de postulaciones) están en `.gitignore` y nunca entran en git de
   ninguna manera. Un working tree sin commitear es la razón más común de que
   `git pull` se niegue a fusionar (`Your local changes ... would be
   overwritten`).
2. **Previsualiza qué cambió antes de traerte nada:**

   ```bash
   git remote add upstream https://github.com/MadsLorentzen/ai-job-search.git   # solo la primera vez, si clonaste tu propio fork
   git fetch upstream    # u origin, si clonaste la plantilla directamente
   python3 tools/check_upstream_updates.py
   ```

   Dos herramientas responden a dos preguntas distintas, y conviene ejecutar
   ambas:

   - **`check_upstream_updates.py`** — *¿qué de mis ficheros personalizados
     cambió?* Lee la marca `framework_version` de cada fichero de metodología,
     así que señala exactamente los ficheros customizados que tocó una release.
   - **`upstream_triage.py`** — *¿qué commits de upstream merecen mi atención?*
     Recorre los commits que te faltan y los ordena en "vale la pena revisarlo"
     vs "probablemente saltar", descartando lo que ya cherry-pickearaste
     (emparejado por `git patch-id`, así que el trabajo portado se apaga sin
     bookkeeping extra), los commits que solo tocan ficheros que tu fork borró
     y los SHA que hayas listado en `.github/upstream-wontport.txt`. Es
     **solo informe**: imprime líneas `git cherry-pick` listas para copiar pero
     nunca fusiona, sube ni abre PR, porque en un fork "aplica limpio" no es
     "correcto".

     ```bash
     python3 tools/upstream_triage.py --remote upstream
     ```

   Los forks heredan también `.github/workflows/upstream-watch.yml`, que corre
   cada semana y deja el resultado en un único issue rotatorio (no hace nada en
   el propio upstream, y queda desactivado en tu fork hasta que actives
   Actions).
3. **Fusiona con normalidad.** `git merge upstream/master` (o `git pull`) hace
   un merge a tres vías de las ediciones de upstream alrededor de tu
   personalización; como las ediciones de metodología rara vez tocan las líneas que
   `/setup` rellenó, la mayoría de las actualizaciones aplican limpiamente. Un
   conflicto en un fichero personalizado es una **feature**, no un fallo:
   significa que upstream cambió la metodología en una sección que
   personalizaste, y la marca de versión más el commit del changelog te dicen
   por qué. Resuelve conservando tus datos y adoptando el cambio de
   metodología alrededor.

---

## 9. Troubleshooting

### "salary_data.json not found"

Es lo esperado si no has configurado el benchmarking salarial. El workflow
`/apply` omite este paso automáticamente.

### Las CLIs de búsqueda de empleo no funcionan

Comprueba que Bun está instalado y que ejecutaste `bun install` en cada
directorio `cli/`. Las herramientas necesitan acceso a red para obtener las
ofertas.

### Errores de compilación LaTeX

- CV: usa `lualatex` (pdflatex suele fallar en MiKTeX moderno con errores de
  expansión de `fontawesome5`; lualatex compila las mismas fuentes sin
  problemas).
- Carta: usa `xelatex` (por las fuentes propias en `OpenFonts/fonts/`).
- Asegúrate de que tu distribución de LaTeX incluye el paquete `moderncv`.

### "Fonts not found" en la carta

La plantilla espera las fuentes en `cover_letters/OpenFonts/fonts/`. Comprueba
que ese directorio existe y contiene los ficheros de Lato y Raleway.

### `.claude/settings.local.json` obsoleto de un clon anterior

Los permisos compartidos de Claude Code viven ahora en `.claude/settings.json`:
una lista `allow` acotada a los comandos exactos que ejecuta el workflow (cada
CLI de portal por ruta, los scripts de `tools/`, `salary_lookup.py`,
`pdftotext`), una lista `ask` que siempre pregunta antes de editar los ficheros
que definen permisos o antes de `git push`, y una lista `deny` que bloquea
comandos shell con forma de subida y la lectura de ficheros de credenciales en
cualquier modo. `SECURITY.md` tiene la tabla completa. Versiones anteriores de
este repo commiteaban un `.claude/settings.local.json` más permisivo que
pre-aprobaba `Bash(curl:*)`, `Bash(python:*)` y `Bash(bun:*)`. Si clonaste
antes de ese cambio, git deja el fichero viejo en tu working copy y sus
permisos se siguen aplicando por encima de `settings.json`. Bórralo (o
recórtalo a tus overrides personales):

```bash
rm .claude/settings.local.json
```

### `git pull` se niega a fusionar

"Your local changes ... would be overwritten" casi siempre significa que
tienes cambios sin commitear. Commitea tu personalización y vuelve a intentarlo.

---

## 10. Seguridad y privacidad

Lee esto **antes** de enviar ninguna postulación.

- **Qué se versiona y qué no.** `job_search_tracker.csv` (con datos de
  contacto), `salary_data.json`, `documents/` y `documents/applications/` están
  en `.gitignore` y nunca entran en git. **Pero** `CLAUDE.md` y los ficheros
  `01..09-*.md` **sí están versionados**: tu nombre, email, experiencia y
  expectativas salariales acabarían en el historial de git.
- **Ejecuta `/setup` siempre en un repositorio privado**, nunca en un fork
  público.
- **La skill no envía nada por su cuenta.** `/outcome followup` redacta
  borradores (no envía emails, como máximo dos por postulación);
  `/gmail-sync` y `/notion-sync` necesitan conectores MCP y revisión humana.
- **Superficie de permisos** (`.claude/settings.json`): `allow` (comandos
  exactos que el workflow necesita), `ask` (editar `settings.json`,
  `settings.local.json`, `SKILL.md`, `commands/*.md`, `agents/**`,
  `.github/**`, `tools/security_guards.py`, y `git push`), `deny` (leer `.env`,
  `~/.ssh/**`, `~/.aws/**`, `~/.gnupg/**`; y `curl`/`wget` en modo POST/PUT/
  upload, `scp`, `sftp`, `ssh`, `nc`).
- **Las ofertas se tratan como input no confiable.** `tools/posting_guard.py`
  filtra texto oculto, caracteres invisibles y líneas con forma de instrucción
  antes de que el agente las lea como contenido. Pero las defensas son a nivel
  de instrucción, no un sandbox: en un portal de ofertas que no conozcas,
  repasa lo que se ha descargado y escrito antes de pulsar "enviar". Detalles
  en [`SECURITY.md`](SECURITY.md).

---

## Checklist rápido

```bash
# 1. Dependencias
python3 --version                      # 3.10+
bun --version                          # CLIs de portales
lualatex --version && xelatex --version   # plantillas

# 2. Dependencias de las CLIs
python3 tools/install_portal_clis.py

# 3. Claude Code en la raíz del repo
claude
#   → /setup
#   → /scrape
#   → /rank
#   → /apply <url>
```

---

## Comandos disponibles

| Comando | Qué hace |
|---|---|
| `/setup` | Onboarding: perfil, CV de ejemplo, queries de búsqueda |
| `/scrape` | Busca ofertas en varios portales, deduplica y ordena por encaje |
| `/rank` | Puntúa en lote las postulaciones nuevas y devuelve un ranking |
| `/apply <url>` | Flujo completo: evaluar, redactar, revisar, compilar y verificar PDFs |
| `/interview` | Pack de preparación de entrevista y mock interview |
| `/outcome` | Registra el resultado, archiva materiales, actualiza el tracker |
| `/expand` | Enriquece el perfil desde fuentes públicas ya enlazadas |
| `/upskill` | Mapa de calor de brechas de skills + plan de aprendizaje |
| `/html-report` | Dashboard HTML offline a partir del tracker y los archivos |
| `/add-template` | Registra tu propia plantilla (LaTeX, Typst, etc.) |
| `/add-portal` | Genera un skill de búsqueda para el portal de tu mercado |
| `/notion-sync` | Vista de una sola dirección del pipeline en Notion |
| `/gmail-sync` | Detecta estado de postulaciones desde Gmail (requiere conector) |
| `/reset` | Borra los datos de perfil o la carpeta de documentos |
