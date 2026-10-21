> [!NOTE]
> AI usage disclosure: Most of the code in this project is AI generated, based on my specifications.

# Breathing Timer

A guided breathing timer (4-6-7 and Box Breathing) with tempo control, night mode, count tick marks, and optional sound. The production build is a single self-contained `index.html` that works offline, straight from a local file.

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
- `src/presets.ts` — breathing presets and tempos
- `src/engine.ts` — session state machine, phase timing, and sound cue times
- `src/renderer.ts` — draws the ring, tick marks, and labels from the engine's signal
- `src/sound.ts` — synthesized sounds queued ahead on the audio clock
- `src/theme.ts` — night mode activation
- `src/main.ts` — wires controls, the frame loop, and sound together
- `test/` — smoke test for the built single-file app
