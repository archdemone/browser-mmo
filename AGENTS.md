# Repository Guidelines

## Project Structure & Module Organization
- `src/` is the heart of the Babylon-driven ARPG: `core/` boots `main.ts` with the engine/input loop, `gameplay/` and `skills/` hold combat systems, `visuals/`, `vfx/`, and `ui/` drive render/overlay logic, and `scenes/` plus `state/` manage runtime scenes and persistence.
- Keep data assets in `src/data/`, support utilities in `src/utils/`, exported types in `src/types/`, and static artifacts under `public/` plus `docs/` for references. `build-tests/` hosts Node-based skill snapshots that mirror in-game systems.
- Vite outputs in `dist/` and intermediate builds in `node_modules/`; use `package.json` scripts to coordinate dev, build, and test flows.

## Build, Test, and Development Commands
- `npm run dev`: Launch Vite hot-reload with `--open` to iterate on scenes or skill responses at `http://localhost:5173`.
- `npm run build`: Run the production Vite build (Babylon bundles + tree shaking) before shipping assets.
- `npm run preview`: Serve the production output locally to sanity-check deployments.
- `npm run test:status`: Type-checks via `tsc -p tsconfig.tests.json` and runs `build-tests/skills/tests/StatusSystem.test.js` to validate skill logic.
- `npm run check:types`: `tsc --noEmit` with the main config to keep TypeScript errors at bay.
- `npm run build:agent`: Agent-safe build path that guards Babylon camera observables; rerun locally when `ROLLUP_SKIP_NODEJS_NATIVE` is required.

## Coding Style & Naming Conventions
- Use 2-space indentation, `camelCase` for functions/variables, and `PascalCase` for classes/interfaces that mirror Babylon constructs (e.g., `PlayerAnimator`).
- Prefer explicit typing and `readonly` where possible; keep `import` statements grouped by npm/browser-built modules then local paths.
- Keep modules small—one scene, system, or UI component per file—and align file names with exported class names (e.g., `Player.ts` exports `Player`).

## Testing Guidelines
- Tests live in `build-tests/skills/tests` and follow the `*.test.js` naming pattern. Add a matching script when new skill logic needs coverage.
- Run `npm run test:status` after touching skill systems or when dependencies change to catch regressions before pushing.
- Include the testing command and results in PR descriptions if tests fail or require manual verification.

## Commit & Pull Request Guidelines
- Commit messages favor `Scope: short description` (e.g., `Build/TS: ...`, `Add: ...`) with present-tense verbs and concise reasoning.
- PRs should describe the change, list related issues/tickets, and attach screenshots/video for UI work; note any manual verification steps (dev server URL, required flags).
- Mention relevant testing commands in each PR and call out performance impacts or risky zones (physics, render loop) so reviewers know what to validate.

## Assets & Tooling Notes
- Babylon assets live under `public/` and any generated `.json` data should go with `src/data/`; keep texture size/format consistent with runtime budget.
- Use Vite’s hot reload (`npm run dev`) for most iteration, but rebuild via `npm run build` before tagging commits.

