> [!NOTE]
> AI usage disclosure: Most of the code in this project is AI generated, based on my specifications.

# Breathing Timer

A guided breathing timer (Balanced Breathing, Box Breathing, 4-6-7 Breathing, and Breath Retention) with tempo control, night mode, count tick marks, and optional sound. The production build is a single self-contained `index.html` that works offline, straight from a local file.

The arrows inside the pattern selector step through the patterns without opening the list. The Tempo selector depends on the pattern: Slow, Normal, or Fast for 4-6-7 Breathing and Breath Retention, and the phase length for Balanced Breathing (4 to 7 seconds) and Box Breathing (3 to 8 seconds). Each pattern remembers its tempo while the page is open.

Breath Retention runs rounds of fast breathing (20 to 40 breaths), a breath hold you end with **Breathe in**, and a short recovery breath with a 15 s hold. The hold times of finished rounds are listed below the circle until the next session starts.

[open on GitHub pages](https://leuchtmetall.github.io/BreathingTimer/)
## Requirements

- Node.js 20.19 or newer (required by Vite 7)
- npm

Install dependencies once:

```sh
npm install
```

## Run in development

```sh
npm run dev
```

Opens a Vite dev server with hot reload, by default at <http://localhost:5173>. To try it on a phone on the same network, run `npm run dev -- --host` and open the printed network address.

## Build

```sh
npm run build
```

Type-checks with `tsc`, then writes one file, `dist/index.html`, with all JavaScript and CSS inlined. Open it directly in a browser (no server needed), or preview the build with:

```sh
npm run preview
```

## Run tests

```sh
npm run build && npm test
```

`npm test` runs the whole Vitest suite once. Build first: `test/built.smoke.test.ts` runs the real `dist/index.html` and fails with "dist/index.html is stale" if any source file is newer than the build.

To run only the source tests (no build needed), or watch them while working:

```sh
npx vitest run src   # unit and DOM tests only
npx vitest           # watch mode
```

The DOM tests run in jsdom, which has no Web Audio, so sound is tested against a fake audio context. Background and locked-screen playback still need a manual check on real devices.

## Project layout

- `index.html` — page markup
- `src/presets.ts` — breathing presets (including Breath Retention) and tempos
- `src/engine.ts` — session state machine, phase timing, and sound cue times
- `src/renderer.ts` — draws the ring, tick marks, and labels from the engine's signal
- `src/sound.ts` — synthesized sounds queued ahead on the audio clock
- `src/theme.ts` — night mode activation
- `src/main.ts` — wires controls, the frame loop, and sound together
- `src/debug.ts` — developer switch: set `DEBUG = true` to get Pause and Resume back (off in the shipped build)
- `test/` — smoke test for the built single-file app
