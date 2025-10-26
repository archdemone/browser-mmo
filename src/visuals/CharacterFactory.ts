import type { AnimationGroup, ISceneLoaderAsyncResult, Scene, TransformNode } from "babylonjs";
import { SceneLoader } from "babylonjs";
import "babylonjs-loaders";
import { PlayerAnimator } from "./PlayerAnimator";

interface PlayerCharacterResult {
  rootMesh: TransformNode;
  animator: PlayerAnimator;
}

const PLAYER_ASSET_PATH = "/assets/characters/player/";

/**
 * Loads the player character mesh and associated animations into the provided scene.
 */
export async function createPlayerCharacter(scene: Scene): Promise<PlayerCharacterResult> {
  const baseResult: ISceneLoaderAsyncResult = await SceneLoader.ImportMeshAsync(
    "",
    PLAYER_ASSET_PATH,
    "player_base.glb",
    scene
  );

  const rootMesh = (baseResult.meshes.find((mesh) => !mesh.parent) ?? baseResult.meshes[0]) as TransformNode;

  await SceneLoader.AppendAsync(PLAYER_ASSET_PATH, "player_idle.glb", scene);
  await SceneLoader.AppendAsync(PLAYER_ASSET_PATH, "player_run.glb", scene);
  await SceneLoader.AppendAsync(PLAYER_ASSET_PATH, "player_sprint.glb", scene);
  await SceneLoader.AppendAsync(PLAYER_ASSET_PATH, "player_dodge.glb", scene);
  await SceneLoader.AppendAsync(PLAYER_ASSET_PATH, "player_attack.glb", scene);

  const findGroup = (keyword: string): AnimationGroup | undefined => {
    const lowerKeyword = keyword.toLowerCase();
    return scene.animationGroups.find((group) => group.name.toLowerCase().includes(lowerKeyword));
  };

  const idleGroup = findGroup("idle");
  const runGroup = findGroup("run");
  const sprintGroup = findGroup("sprint");
  const dodgeGroup = findGroup("dodge");
  const attackGroup = findGroup("attack");

  if (!idleGroup || !runGroup || !sprintGroup || !dodgeGroup || !attackGroup) {
    throw new Error("Failed to load one or more player animation groups.");
  }

  const animator = new PlayerAnimator({
    idle: idleGroup,
    run: runGroup,
    sprint: sprintGroup,
    dodge: dodgeGroup,
    attack: attackGroup,
  });

  return { rootMesh, animator };

  // TODO: Centralize animation group naming conventions to avoid brittle lookups.
  // TODO: Provide graceful fallbacks when optional animations are missing (e.g., sprint).
  // TODO: Validate skeleton compatibility before binding animations.
}
