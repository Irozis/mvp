# Adaptive Graphics MVP

React + Vite frontend for generating and repairing adaptive ad/layout variants. The main app runs in the browser, while the repository also contains calibration and diagnostics scripts used for offline analysis.

For day-to-day development, the important workflow is still the standard frontend loop: install dependencies, run the Vite dev server, build, and run tests. The `scripts/calibration` and `scripts/diagnostics` entry points are useful for deeper analysis, but they are not required for the basic developer setup.

## Environment

- Recommended: Node.js 20+ with npm 10+
- Verified in this workspace: Node `24.13.0`, npm `11.6.2`
- The current Vite/Vitest toolchain supports modern Node releases; if you use an older version, start with Node 20 LTS before debugging repo issues.

## Install

```bash
npm ci
```

The committed lockfile is generated against the public npm registry. If install still fails because npm is trying to use a private or corporate registry, check your user/global npm configuration first and make sure it can reach or proxy `registry.npmjs.org`.

If you intentionally change dependencies, use:

```bash
npm install
```

and commit the resulting `package-lock.json`.

## Run locally

```bash
npm run dev
```

Start the Vite dev server. If you need an explicit host:

```bash
npm run dev -- --host 127.0.0.1
```

## Build

```bash
npm run build
```

Produces a production bundle in `dist/`.

## Test

```bash
npm test
```

Runs the current Vitest suite in Node mode.

## Quickstart

1. Install Node 20+ and npm 10+.
2. Run `npm ci`.
3. Start development with `npm run dev`.
4. Verify production build with `npm run build`.
5. Run the test suite with `npm test`.
