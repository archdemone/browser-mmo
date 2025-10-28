# browser-mmo

## Visual Hideout Scene Reference Notes (Part 0)
- **Tech stack / renderer**: The game uses [Babylon.js](https://www.babylonjs.com/) driven from TypeScript via Vite. `src/core/Game.ts` boots a single Babylon `Engine` tied to the `#renderCanvas` element and drives a per-frame render loop.
- **Scene / level definition**: Scenes are plain TypeScript classes under `src/scenes/` that implement the `SceneBase` interface. `SceneManager` swaps between the `HideoutScene` and `DungeonScene` by instantiating these classes and calling their `load()` / `update()` / `dispose()` methods. Each scene is responsible for constructing its own Babylon `Scene`, geometry, lights, and registering gameplay hooks.
- **Player character pipeline**: `Player.createAsync()` (in `src/gameplay/Player.ts`) calls `createPlayerCharacter()` from `src/visuals/CharacterFactory.ts`, which imports Mixamo-authored `.glb` files from `/assets/characters/player/`. The loader assembles the base mesh, clones animation clips into a unified skeleton, strips root motion, and wraps them in `PlayerAnimator` for locomotion/attack/dodge state management. Player control logic then lives on the `Player` class, which reads input (`src/core/Input.ts`), updates movement/dodge, and feeds animation state to `PlayerAnimator` while exposing combat APIs for other systems.
- **UI rendering**: HUD, spawn controls, and toggles are DOM overlays authored in `src/ui/HudUI.ts`. They are injected as HTML elements fixed atop the canvas (pointer-events gated) and updated each frame from scene code (`HudUI.update`). Other UI modules follow the same HTML overlay approach under `src/ui/`.

These notes capture the current hideout/test arena tech structure before art pass work begins.
