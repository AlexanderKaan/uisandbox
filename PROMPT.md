# UISandbox — je bestaande app 1:1 in een sandbox, en dan spelen met de tokens

> Openingsprompt voor een vers project. Lees eerst dit bestand, dan `HANDOFF.md`
> (wat er in de doos zit en waar het vandaan komt), dan `notes/` (wat we in het
> moederproject leerden — de valkuilen die tijd kostten). Daarna: begin bij
> "Wat eerst", en niet bij een leeg canvas.

## Eén ding goed doen

**Upload je huidige app — of koppel je repo — en speel in een sandbox met het
design.** Kleuren, lettertypes, radii, spacing, elevation: je draait aan de
knoppen en ziet je eigen interface veranderen. Niets wordt herontworpen, niets
wordt "strakgetrokken": **we tokeniseren alles** en tonen de app **precies zoals
hij was — 1 op 1**, met de juiste lettertypes en de juiste kleuren. Pas als jij
draait, verandert er iets. Tot je tevreden bent; dan exporteer je de waarden.

- **Elke techniek**: iOS-app, React, website, app. Zip erin of repo koppelen; wij
  nemen het exact over.
- **Niet de hele codebase**: een pre-scan, dan de vraag *"welke schermen wil je
  testen?"* — je kiest er een paar, die laden we.
- **Niets behouden behalve** de cockpit-knoppen om tokens aan te passen en de
  upload/koppeling van je eigen codebase. Geen componentbibliotheek, geen
  showcases, geen audit-rapport, geen forge, geen generative UI. Eén scherm: jouw
  app, links de knoppen.
- **Ook als MCP / live binnen een LLM**: "gooi je app in de sandbox en kijk hoe
  hij eruitziet met andere kleuren, lettertypes, radii" is op zichzelf al de
  waarde — een agent moet dat kunnen doen zonder onze UI (open · knop zetten ·
  screenshot · export).
- **De waarden exporteer je los**: als CSS-variabelen, JSON, Tailwind, shadcn,
  en voor iOS als asset-catalog/Swift-constanten. Wat je exporteert is precies
  wat er in de sandbox stond.

## Waar het uit voortkomt (en wat het NIET is)

Dit is een spin-off van **UIcockpit** (`../Cockpit UI configurator`). Daar staat
een design-system configurator: 14 visuele knoppen → live preview → export van
`--k-*` tokens, met een eigen componentbibliotheek, een audit (lees een
codebase, leid het design system af dat er al in zit), een forge en een
generative-UI-sandbox. UISandbox houdt daar **twee dingen** van: de knoppen met
de token-engine erachter, en de reader die een codebase tokeniseert. De rest
laat je liggen.

⚠️ Eerder is in UIcockpit een "Your app"-sandbox gebouwd en weer **weggehaald**:
die liet een model (Opus) de app *hertekenen* op onze componenten (block-board +
extractie). Te duur, verkeerde focus. UISandbox doet het tegenovergestelde:
**geen model in het renderpad, geen hertekening — de app zelf, 1:1, met
vervangbare waarden.** Als je jezelf betrapt op "we bouwen het scherm na", ben je
de verkeerde kant op.

## Wat je meekrijgt (`foundation/`)

Alles hieronder is werkende, geteste code uit UIcockpit (TS strict, React 19,
Vite, vitest). Details en afhankelijkheden in `HANDOFF.md`.

1. **`tokens/` — de engine.** `buildTokens(config)` → ~260 `--k-*` CSS-variabelen
   (kleurrampen in OKLCH, tekst, spacing, radius, elevation, motion, states) uit
   14 knoppen. Met contrast-**vloeren** die geen knopstand kan breken
   (`knobSweep.test.ts` veegt elke stand × 16 thema's × 2 modi) en de regel "een
   token dat een VULLING dient, dient nooit ook INKT".
2. **`panel/` — de knoppen.** `Panel.tsx`: de 14 controls (Conformance · Brand ·
   Scale · Neutrals · Harmony · Display font · Body font · Text size · Label case ·
   Box radius · Elevation · Surface · Background · Border), font-picker met
   custom fonts, saved slots. Plus `styles/panel.css`.
3. **`state/` — config, geschiedenis, deel-link.** Reducer, undo/redo, de config
   in de URL-hash (lz-string), 3 opgeslagen kits in localStorage.
4. **`export/` — de waarden eruit.** CSS-vars, JSON, Tailwind, shadcn (`genCss`
   bundelt in UIcockpit ook de componentbibliotheek — dat deel schrap je).
5. **`audit/` — de reader die een codebase tokeniseert.** Zero-dep engine
   (`engine/*.mjs`): leest CSS/SCSS/Less, Tailwind-klassen (incl. `cn()`, Vue
   `:class`), CSS-modules, styled-components/Emotion, theme-objecten, server-
   templates (HEEx/ERB/Blade/Twig…), lost `var()`-ketens en Tailwind-paletnamen
   op (v3/v4, gegenereerd uit Tailwinds eigen bestanden). Levert per dimensie
   (kleur · type · spacing · radius · shadow) alle waarden mét vindplaatsen, de
   afgeleide config (`inferredConfig`: brand-hex, radius, schaal, type-scale, met
   confidence en herkomst), `classStyles` (klasse → geresolveerde declaraties).
   Gemeten: leest **97–99 %** van 16 echte repo's en had het merk **8 van 8**
   keer goed tegen het scherm van de draaiende app (`bench/audit-bench.mjs`).
   Plus de browser-**intake** (`intake/`): map-drop, zip (incl. ZIP64), gecapte
   scan met prioriteit stylesheets → components → rest; en `handoff.ts`: audit
   → `Config` (de knoppen op de stand van hún codebase). **Dit is je "tokeniseer
   alles"-stap: de audit weet al welke letterlijke waarde waar staat.**
6. **`notes/`** — de lessen. Lees vooral `notes/traps.md` (het instrument liegt
   even vaak als het gemetene; een token wordt gesubstitueerd, niet gelezen).

## De harde noten — ontwerp die eerst, niet als laatste

1. **1:1 renderen per techniek.** Web/React: draai of build hun app en injecteer
   token-overrides — de audit levert de kaart *letterlijke waarde → token*, dus
   "tokeniseren" = een substitutieblad (`#4f39f6` → `var(--k-primary)`, `12px` →
   `var(--k-radius-md)`) dat je op hun CSS/klassen toepast in een iframe, en
   dan de `--k-*` uit de engine erover. iOS: er is geen browser-render van een
   iOS-app; wees eerlijk — begin met web, en lever voor iOS eerst *export naar
   asset-catalog/Swift-constanten* (en later: simulator-screenshots als de
   render). Beloof geen 1:1-iOS voordat je het hebt.
2. **De pre-scan en de schermkiezer.** Routes/pagina's/schermen ontdekken uit de
   repo (Next/Vite/Expo/Xcode-project) en er een paar laten kiezen. Cap de scan
   (de intake doet dat al: budget + prioriteit) — de audit leerde dat een cap in
   mapvolgorde = willekeur is.
3. **Hun tokens ↔ onze knoppen, twee richtingen.** `handoff.ts` doet audit →
   Config (de knoppen op hun stand). De andere richting is nieuw: knop draaien →
   *hun* waarden herschrijven, ook waar ze géén variabele gebruikten. Dat is de
   kern van het product.
4. **De MCP.** `sandbox_open(zip|repo)` · `sandbox_screens()` ·
   `sandbox_pick(screens)` · `sandbox_set(knob, value)` · `sandbox_screenshot(screen)`
   · `sandbox_export(format)`. Dezelfde engine, geen tweede versie.

## Wat eerst (voorstel voor sprint 1)

1. Scaffold: Vite + React + TS strict + vitest; kopieer `foundation/tokens`,
   `state`, `panel`, `export` naar `src/` en maak ze groen (imports · deps ·
   tests). Laat het paneel een **leeg canvas** met de `--k-*` vars aansturen.
2. Intake: zip/map erin (`audit/intake`) → `auditFiles()` → `configFromAudit()`
   → de knoppen staan op de stand van hún codebase, met herkomst per knop.
3. De eerste renderer: een gebouwde website/React-app in een iframe, hun CSS
   herschreven via het substitutieblad, `--k-*` erover, live bij elke draai.
   Meet vóór je iets aanneemt (zie `notes/traps.md`).
4. De schermkiezer (routes uit de repo → kies → laad).
5. Export (CSS/JSON/Tailwind/shadcn + iOS-constanten) — precies wat er stond.
6. Dan pas de MCP.

## Huisregels die meegaan

- **Nothing needs to be backwards compatible.** Refactor vrij.
- **Één bron, geen spiegel.** Een waarde/regel leeft op één plek; export en
  preview lezen dezelfde.
- **Het instrument liegt even vaak als het gemetene** — neem een control mee
  (een no-CSS-pagina, een bekende waarde) voordat je een bevinding gelooft.
- **Een token wordt gesubstitueerd, niet gelezen**: test met de échte
  `buildTokens`-output, nooit met een gespiegelde tabel.
- Geen backticks in CSS-commentaar binnen template-literals (kost tsc-uren).
- Ratchets (magic-px, structural-inline) mogen alleen omlaag.
- Commits als **Alexander Kaan** (`git -c user.name="Alexander Kaan" -c
  user.email="amkaan@gmail.com"`), geen AI-trailer; niets pushen/publiceren
  zonder expliciet akkoord; geen secrets in de repo.
- Werktaal: chat in het Nederlands, code/copy in het Engels.

Begin met een korte samenvatting terug: wat je in de doos vindt, welke van de
harde noten je als eerste kraakt en waarom, en een sprint-1-plan van hoogstens
tien regels. Dan bouwen.
