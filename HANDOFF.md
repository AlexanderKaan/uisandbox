# HANDOFF — wat er in de doos zit, waar het vandaan komt, wat het nodig heeft

Bron: **UIcockpit** (`../Cockpit UI configurator`, commit `1eecb19`, 2026-08-17).
Alles hier is een KOPIE — bewerk vrij, dit project heeft zijn eigen leven. Waar de
kopie iets uit UIcockpit nodig heeft dat NIET meekwam (de componentbibliotheek,
de galerij, het app-chrome), staat dat hieronder per bestand.

## De kaart

```
foundation/
  tokens/        de engine: config → --k-* vars              (zelfstandig; deps: geen)
  panel/         de 14 knoppen                                (deps: tokens · state · lucide-react; vizFactories: 3 icon-libs, weg te laten)
  state/         reducer · undo/redo · URL-hash · 3 slots     (deps: tokens · lz-string)
  export/        CSS-vars · JSON · Tailwind · shadcn · zip    (deps: tokens; genCss ook de KIT — schrappen)
  audit/engine/  de reader — zero-dep .mjs                    (deps: geen; Node ≥ 20 of browser)
  audit/intake/  map-drop · zip · handoff → Config            (deps: engine · tokens)
  audit/__tests__/  node:test (engine) + vitest (intake)
  bench/         audit-bench.mjs — 16 echte repo's, de meter (clones niet meegekomen; --fetch)
  styles/panel.css  het paneelchrome (leest --app-* vars, zie onder)
notes/           de lessen — lees traps.md eerst
```

## Per map

### `tokens/` — de engine (kopieer als geheel)

| bestand | wat |
|---|---|
| `types.ts` | `Config` (de 14 knoppen + afgeleiden: `colorTheme · color · radius · scale · conformance · typeScale · labelCase · fontDisplay · fontBody · iconSet · surfaceDepth · surface · borders · cPrimary · harmony · spread · expression · neutral · canvas · mode`), `Tokens`, alle enums |
| `defaults.ts` | `DEFAULT_CONFIG` — de gecureerde default-kit |
| `buildTokens.ts` | **`buildTokens(cfg) → { vars }`**: ~215 tokenfamilies (`--k-primary/accent/secondary` rampen, `--k-surface*`, `--k-fg*`, `--k-type-*`, `--k-s-*` spacing (2…32), `--k-radius-*`, `--k-shadow-*`, `--k-anim/ease/spring`, `--k-state-*`, `--k-field/input-*`, `--k-btn-*`, `--k-row-*`, `--k-icon-*`, `--k-measure-*`, `--k-chart-*`, `--k-grad-*`, `--k-z-*`). Kleur in **OKLCH**. Bevat de contrast-VLOEREN (input-border ≥ 3:1 tegen vulling+surface+pagina; ink is de verste leesbare tekst t.o.v. de pagina, niet de drukste kleur). |
| `color.ts` | de wiskunde: hex↔hsl↔oklch, rampen (`okAccentScale`, `okNeutralScale`), `contrast`, `readableInk`, `clampToAA`, `nameColor` |
| `extras.ts` | contrastparen + `auditContrast(tokens)` (de a11y-badge), window-classes |
| `harmony.ts` | Spread/Expression-presets (`HARMONY_PRESETS`, `resolveHarmony`) — primary roteert NOOIT |
| `coherence.ts` | `guardedBorders` — knopcombinaties die niet lelijk mogen worden |
| `fonts.ts` · `customFonts.ts` | de fontlijsten (Google Fonts import), custom fonts via `@font-face` |
| `stylesAndThemes.ts` | `COLOR_THEMES` (16 named brand hues), `applyColorTheme` |
| `__tests__/` | **`knobSweep`** (elke knopstand × 16 thema's × 2 modi breekt geen vloer), `knobEffect` (geen knop is inert), `buildTokens`, `color`, `contrast`, `harmony`, `states`, `stylesAndThemes` — vitest, jsdom niet nodig |

### `panel/` — de knoppen

- `Panel.tsx` — de 14 controls, gegroepeerd (Foundation · Color · Typography · Shape ·
  Surface), lock-per-knop, Shuffle/Reset. Props: `cfg · tokens · dispatch(ConfigAction) ·
  provenance? · onCollapse · onRandomize · onReset`. Importeert `type ProvenanceState`
  uit `audit/intake/handoff.ts` (de badge "afgeleid uit jouw code / gewijzigd / default").
- `FontPicker.tsx` (custom fonts), `SavedKits.tsx` (3 slots), `primitives/Seg.tsx`.
- `vizFactories.tsx` — mini-previews per knopwaarde; importeert **iconoir · phosphor ·
  heroicons** voor een oude icon-set-knop. Weglaten of strippen.
- `styles/panel.css` — leest `--app-*` variabelen (fg, fg-muted, surface, border, hover,
  dur, ease…) die in UIcockpit in `chrome.css` als alias op `--k-*` staan. Zet in de
  sandbox `--app-x: var(--k-x)` op de root, of hernoem. ⚠️ Panel-CSS is UIcockpit-chrome;
  restylen mag, de knoppen zelf niet weglaten — dat is het product.

### `state/`

- `configReducer.ts` (`SET · REPLACE · …`), `historyReducer.ts` (undo/redo),
  `useConfig.ts` (config + tokens + hash in één hook), `hash.ts` (config ↔ `#…` via
  **lz-string**), `savedKits.ts` (`uicockpit:kit:1..3` in localStorage — hernoem de key),
  `randomKit.ts` (Shuffle, guardrail-aware). Tests in `__tests__/` (`brief.test.ts`
  hoort bij een niet-meegekomen `brief.ts` — weg).

### `export/`

- `genJson.ts` · `genTailwind.ts` · `genShadcn.ts` — tokens → formaat; `iconLibs.ts`
  (weg als icons niet meegaan), `zip.ts` (bundel).
- `genCss.ts` — ⚠️ importeert `../kit` (assembleKitCss, globalLayer): dat is de
  componentbibliotheek. Houd alleen het **token-blok** (de `--k-*` root-regel +
  fonts-import + custom-font faces); schrap de rest.
- Nog niet in de doos, wel gewenst: **iOS-export** (asset-catalog JSON + Swift-constanten
  uit dezelfde tokens).

### `audit/engine/` — de reader (zero-dep, één bron)

- `audit.mjs` — **`auditFiles(files: {path, content}[], opts) → result`** (puur, browser-
  bundelbaar) + `runAudit(argv)` (Node-shell: mappen lopen, geïnstalleerde Tailwind-palette
  lezen). Result: `meta` (files · elements · **parsed** = leesaandeel · unreadable-kinds ·
  stack · palette-bron), `dimensions.{color,type,spacing,radius,shadow}` (`values[]` met
  `count` en `at[]` vindplaatsen — **het substitutieblad**), `classStyles` (klasse →
  geresolveerde declaraties, `var()`-ketens platgeslagen), `kinds` (welke componentsoorten
  ze bouwen), `sprawl`, `flags`, `surfaces` (page/ink/border), **`inferredConfig`**
  (`values.brandHex · colorTheme · radius · scale · typeScale`, `confidence.*`,
  `colorThemeSource`). Twee eerlijkheidsregels die je laat staan: **weigert onder 70 %
  coverage**, en scoort een ongemeten dimensie nooit als perfect.
- `patterns.mjs` — de extractors (CSS/SCSS/Less, Tailwind incl. `cn()`/Vue/`$style`,
  CSS-modules, styled/Emotion incl. theme-functies en theme-objecten, server-templates,
  docs-/dark-/contrast-scopes). ⚠️ Bevat NUL-bytes → `grep -a`.
- `colorspace.mjs` — parseColor (hex/rgb/hsl/oklch/triplets/Tailwind-namen), ΔE00
  (Sharma-gepind), `resolvePalette` (repo-overrides > geïnstalleerd > **`tw-palette.mjs`**
  = Tailwind v3/v4 defaults, GEGENEREERD door `gen-tw-palette.mjs` uit Tailwinds eigen
  bestanden — nooit typen), `rgbToOklch`.
- `report.mjs` — het HTML-rapport (button wall). Voor UISandbox waarschijnlijk niet nodig.
- `__tests__/audit.test.mjs` + `colorspace.test.mjs` — `node --test` (Node ≥ 20).

### `audit/intake/` — de browserkant

- `readFiles.ts` (`webkitdirectory`-drop, `SKIP_DIR`, `isScannable`, **`selectFiles`** met
  cap + prioriteit stylesheets → components → rest), `readZip.ts` (zip met de hand, incl.
  ZIP64; central directory eerst), `FolderDrop.tsx` (de drop-UI), `engine.ts` (shim naar de
  .mjs — pad aanpassen), `drift.ts` (voor/na-diff), **`handoff.ts`**
  (`configFromAudit(inferred) → Config`, `provenanceFromAudit`, sessionStorage-handoff).
  Tests (`handoff/intake/drift.test.ts`) — importpaden herschrijven naar de nieuwe mappen.

### `bench/audit-bench.mjs`

Draait de reader over 16 publieke repo's (8 coverage · 4 hold-out met antwoord uit de
bron · 4 LIVE met antwoord van het scherm) en faalt onder 0.95 of op een zeker-fout
merk. Verwacht `../cli/bin/uicockpit.mjs` — pas het pad aan naar jouw CLI-shell of roep
`auditFiles` direct aan. Clones staan in `bench/audit-*/` (gitignored, `--fetch`).

## Afhankelijkheden (npm)

`react ^19` · `react-dom ^19` · `lz-string ^1.5` · `lucide-react` (paneel-iconen) ·
dev: `vite`, `@vitejs/plugin-react`, `typescript ~6`, `vitest`, `jsdom` (intake-tests).
Optioneel/weglaten: `iconoir-react`, `@phosphor-icons/react`, `@heroicons/react`
(vizFactories). De audit-engine heeft **geen** deps.

## Wat NIET meekwam, met opzet

De componentbibliotheek (`src/kit/*`), de galerij, de showcases, de forge, de generative-
UI-sandbox, het app-chrome (topbar/stage/modal), de marketingsite, de CLI-shell
(`init`/`check`), de MCP-server. UISandbox tekent niets van ons — het toont hún app.

## De maat waaraan je jezelf houdt

- Elke knop moet in **hún** app iets doen (knobEffect-idee) en niets mag een vloer breken
  (knobSweep-idee) — draag beide tests over op de sandbox.
- 1:1 betekent 1:1: neem een screenshot vóór je iets injecteert en diff ertegen (pixel-
  of DOM-diff). Als "1:1" een gevoel is, is het geen claim.
- Coverage ≠ correctheid (de audit leerde dat hard): een hold-out met bekende antwoorden
  vanaf de eerste week.
