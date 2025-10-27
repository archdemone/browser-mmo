import type { AnimationGroup, ISceneLoaderAsyncResult, Scene, TransformNode } from "babylonjs";
import { SceneLoader } from "babylonjs";
import "babylonjs-loaders";
import { PlayerAnimator } from "./PlayerAnimator";

interface PlayerCharacterResult {
  rootMesh: TransformNode;
  animator: PlayerAnimator;
}

// Resolve GLB URLs via Vite's asset pipeline to avoid 404s from incorrect public paths.
// Files are stored under src/public/assets/characters/player with dot-separated names.
// Using ?url returns a resolved URL string Vite can serve.
// Note: Optional clips (sprint/dodge/attack) may be absent; we guard accordingly.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - Vite will replace these imports at build time
import playerBaseUrl from "../public/assets/characters/player/player.base.glb?url";
// @ts-ignore
import playerIdleUrl from "../public/assets/characters/player/player.idle.glb?url";
// @ts-ignore
import playerRunUrl from "../public/assets/characters/player/player.run.glb?url";
// @ts-ignore
import playerSprintUrl from "../public/assets/characters/player/player.sprint.glb?url";
// @ts-ignore
import playerDodgeUrl from "../public/assets/characters/player/player.dodge.glb?url";
// @ts-ignore
import playerAttackUrl from "../public/assets/characters/player/player.attack.glb?url";

/**
 * Loads the player character mesh and associated animations into the provided scene.
 */
export async function createPlayerCharacter(scene: Scene): Promise<PlayerCharacterResult> {
  // Load the base character
  const baseResult: ISceneLoaderAsyncResult = await SceneLoader.ImportMeshAsync("", "", playerBaseUrl, scene);

  const rootMesh = (baseResult.meshes.find((mesh) => !mesh.parent) ?? baseResult.meshes[0]) as TransformNode;

  // Attempt to load locomotion and action clips. Missing optional clips must not crash.
  await SceneLoader.AppendAsync("", playerIdleUrl, scene);
  await SceneLoader.AppendAsync("", playerRunUrl, scene);

  // Optional clips: try/catch to avoid breaking load when missing in dev
  try {
    await SceneLoader.AppendAsync("", playerSprintUrl, scene);
  } catch (e) {
    console.warn("[QA] Missing sprint animation clip, will fall back to run.", e);
  }
  try {
    await SceneLoader.AppendAsync("", playerDodgeUrl, scene);
  } catch (e) {
    console.warn("[QA] Missing dodge animation clip; dodge will be unavailable.", e);
  }
  try {
    await SceneLoader.AppendAsync("", playerAttackUrl, scene);
  } catch (e) {
    console.warn("[QA] Missing attack animation clip; attack will be unavailable.", e);
  }

  const findGroup = (keyword: string): AnimationGroup | undefined => {
    const lowerKeyword = keyword.toLowerCase();
    return scene.animationGroups.find((group) => group.name.toLowerCase().includes(lowerKeyword));
  };

  let idleGroup = findGroup("idle") ?? null;
  let runGroup = findGroup("run") ?? null;
  let sprintGroup = findGroup("sprint") ?? null;
  const dodgeGroup = findGroup("dodge") ?? null;
  const attackGroup = findGroup("attack") ?? null;

  if (!idleGroup || !runGroup) {
    if (scene.animationGroups.length > 0) {
      const fallback = scene.animationGroups[0] ?? null;
      if (!idleGroup) idleGroup = fallback;
      if (!runGroup) runGroup = fallback;
      console.warn("[QA] Could not match idle/run by name; falling back to first available animation group.");
    }
  }
  if (!idleGroup || !runGroup) {
    throw new Error("Failed to produce required idle+run animation groups.");
  }

  if (!sprintGroup) {
    console.warn("[QA] Sprint clip not found; falling back to run clip.");
    sprintGroup = runGroup;
  }

  const animator = new PlayerAnimator({
    idleGroup,
    runGroup,
    sprintGroup,
    dodgeGroup,
    attackGroup,
  });

  return { rootMesh, animator };

  // TODO: Centralize animation group naming conventions to avoid brittle lookups.
  // TODO: Validate skeleton compatibility before binding animations.
}
