import {
  AbstractMesh,
  AnimationGroup,
  AssetContainer,
  Bone,
  Scene,
  SceneLoader,
  Skeleton,
  TransformNode,
  Vector3,
} from "babylonjs";
import type { ISceneLoaderAsyncResult } from "babylonjs";
import "babylonjs-loaders";
import { PlayerAnimator } from "./PlayerAnimator";

interface PlayerCharacterResult {
  rootMesh: TransformNode;
  animator: PlayerAnimator;
}

const PLAYER_ASSET_PATH = "/assets/characters/player/";
const CLIP_MANIFEST = [
  { key: "idle" as const, file: "player_idle.glb" },
  { key: "run" as const, file: "player_run.glb" },
  { key: "sprint" as const, file: "player_sprint.glb" },
  { key: "dodge" as const, file: "player_dodge.glb" },
  { key: "attack" as const, file: "player_attack.glb" },
];

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
  const collectedClips: Partial<Record<(typeof CLIP_MANIFEST)[number]["key"], AnimationGroup>> = {};
  const baseSkeletons: Skeleton[] = baseResult.skeletons ?? [];

  if (baseResult.animationGroups.length > 0) {
    const baseClip = baseResult.animationGroups[0];
    baseClip.stop();
    baseClip.reset();
    stripRootMotionFromGroup(baseClip, rootMesh);
    collectedClips.idle = baseClip;
  }

  for (const { key, file } of CLIP_MANIFEST) {
    try {
      const container: AssetContainer = await SceneLoader.LoadAssetContainerAsync(
        PLAYER_ASSET_PATH,
        file,
        scene
      );
      container.addAllToScene();

      const importedGroups = container.animationGroups;
      if (importedGroups.length > 0) {
        const primaryGroup = importedGroups[0];
        const cloned = primaryGroup.clone(`player-${key}`, (target: any) => {
          if (target instanceof TransformNode || target instanceof AbstractMesh) {
            const mappedNode = scene.getTransformNodeByName(target.name);
            return mappedNode ?? target;
          }

          if (target instanceof Skeleton) {
            const skeletonMatch =
              baseSkeletons.find((skeleton) => skeleton.name === target.name) ?? baseSkeletons[0];
            return skeletonMatch ?? target;
          }

          if (target instanceof Bone) {
            const sourceSkeleton = target.getSkeleton();
            const targetSkeleton =
              (sourceSkeleton &&
                baseSkeletons.find((skeleton) => skeleton.name === sourceSkeleton.name)) ??
              baseSkeletons[0];
            const boneMatch = targetSkeleton?.bones.find((bone) => bone.name === target.name);
            return boneMatch ?? target;
          }

          return target;
        });

        if (cloned) {
          cloned.name = `player-${key}`;
          cloned.stop();
          cloned.reset();
          stripRootMotionFromGroup(cloned, rootMesh);
          collectedClips[key] = cloned;
        }
      }

      container.removeAllFromScene();
      container.dispose();
    } catch (error) {
      console.warn(`[QA] CharacterFactory failed to import animation "${file}"`, error);
    }

    if (!collectedClips[key]) {
      console.warn(`[QA] CharacterFactory missing animation group for "${key}" after loading ${file}`);
    }
  }

  const initialPosition = rootMesh.position.clone();
  const initialScaling = rootMesh.scaling.clone();
  const initialRotation =
    rootMesh.rotationQuaternion?.toEulerAngles() ?? rootMesh.rotation.clone();

  const movementRoot = new TransformNode("player.movementRoot", scene);
  movementRoot.position.copyFrom(initialPosition);
  movementRoot.rotationQuaternion = null;
  movementRoot.rotation.copyFrom(initialRotation);
  movementRoot.scaling.copyFrom(initialScaling);

  rootMesh.setParent(movementRoot);
  rootMesh.position.setAll(0);
  rootMesh.rotationQuaternion = null;
  rootMesh.rotation.setAll(0);
  rootMesh.scaling.setAll(1);

  const animator = new PlayerAnimator({
    idle: collectedClips.idle ?? null,
    run: collectedClips.run ?? null,
    sprint: collectedClips.sprint ?? null,
    dodge: collectedClips.dodge ?? null,
    attack: collectedClips.attack ?? null,
  });

  const childMeshes: AbstractMesh[] = rootMesh.getChildMeshes();
  const previewMesh: AbstractMesh | null = childMeshes.length > 0 ? childMeshes[0] : null;
  const rootMaterialName =
    (rootMesh as unknown as { material?: { name?: string } }).material?.name ?? undefined;
  const materialName: string = previewMesh?.material?.name ?? rootMaterialName ?? "no-material";

  console.log("[QA] CharacterFactory spawned player mesh:", rootMesh.name, materialName);

  return { rootMesh: movementRoot, animator };

  // TODO: Centralize animation group naming conventions to avoid brittle lookups.
  // TODO: Provide graceful fallbacks when optional animations are missing (e.g., sprint).
  // TODO: Validate skeleton compatibility before binding animations.
}

function stripRootMotionFromGroup(group: AnimationGroup, rootMesh: TransformNode): void {
  for (const targeted of group.targetedAnimations) {
    const animation = targeted.animation;
    if (!animation || typeof animation.targetProperty !== "string") {
      continue;
    }

    const property = animation.targetProperty.toLowerCase();
    if (!property.includes("position") && !property.includes("translation")) {
      continue;
    }

    const target = targeted.target;
    const isRootTransform = target === rootMesh || (target instanceof Bone && !target.getParent());

    if (!isRootTransform) {
      continue;
    }

    const keys = animation.getKeys();
    if (keys.length === 0) {
      continue;
    }

    const firstValue = keys[0].value;
    if (firstValue === undefined || firstValue === null) {
      continue;
    }

    if (typeof firstValue === "number") {
      for (const key of keys) {
        key.value = firstValue;
      }
      continue;
    }

    const vectorValue =
      firstValue instanceof Vector3
        ? firstValue
        : typeof firstValue === "object" && "x" in firstValue && "y" in firstValue && "z" in firstValue
        ? new Vector3(firstValue.x as number, firstValue.y as number, firstValue.z as number)
        : null;

    if (!vectorValue) {
      continue;
    }

    const lockedValue = vectorValue.clone();
    for (const key of keys) {
      key.value = lockedValue.clone();
    }
  }
}
