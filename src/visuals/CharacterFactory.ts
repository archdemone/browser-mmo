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

interface CharacterCreationResult {
  rootMesh: TransformNode;
  animator: PlayerAnimator;
}

const PLAYER_ASSET_PATH = "/assets/characters/player/";
const ENEMY_ASSET_PATH = "/assets/characters/enemy/";

const PLAYER_CLIP_MANIFEST = [
  { key: "idle" as const, file: "player_idle.glb" },
  { key: "run" as const, file: "player_run.glb" },
  { key: "sprint" as const, file: "player_sprint.glb" },
  { key: "dodge" as const, file: "player_dodge.glb" },
  { key: "attack" as const, file: "player_attack.glb" },
];

const ENEMY_CLIP_MANIFEST = [
  { key: "idle" as const, file: "enemy_idle.glb" },
  { key: "run" as const, file: "enemy_run.glb" },
  { key: "sprint" as const, file: "enemy_sprint.glb" },
  { key: "dodge" as const, file: "enemy_dodge.glb" },
  { key: "attack" as const, file: "enemy_attack.glb" },
];

type ClipKey = (typeof PLAYER_CLIP_MANIFEST)[number]["key"];

interface CharacterLoadOptions {
  assetPath: string;
  baseFilename: string;
  clipManifest: { key: ClipKey; file: string }[];
  movementRootName: string;
  logLabel: string;
}

const PLAYER_LOAD_OPTIONS: CharacterLoadOptions = {
  assetPath: PLAYER_ASSET_PATH,
  baseFilename: "player_base.glb",
  clipManifest: PLAYER_CLIP_MANIFEST,
  movementRootName: "player.movementRoot",
  logLabel: "CharacterFactory spawned player mesh",
};

const ENEMY_LOAD_OPTIONS: CharacterLoadOptions = {
  assetPath: ENEMY_ASSET_PATH,
  baseFilename: "enemy_base.glb",
  clipManifest: ENEMY_CLIP_MANIFEST,
  movementRootName: "enemy.movementRoot",
  logLabel: "CharacterFactory spawned enemy mesh",
};

/**
 * Loads the player character mesh and associated animations into the provided scene.
 */
export async function createPlayerCharacter(scene: Scene): Promise<CharacterCreationResult> {
  return loadCharacter(scene, PLAYER_LOAD_OPTIONS);
}

/**
 * Loads the enemy character mesh and associated animations into the provided scene.
 */
export async function createEnemyCharacter(scene: Scene): Promise<CharacterCreationResult> {
  return loadCharacter(scene, ENEMY_LOAD_OPTIONS);
}

async function loadCharacter(scene: Scene, options: CharacterLoadOptions): Promise<CharacterCreationResult> {
  const baseResult: ISceneLoaderAsyncResult = await SceneLoader.ImportMeshAsync(
    "",
    options.assetPath,
    options.baseFilename,
    scene
  );

  const rootMesh = (baseResult.meshes.find((mesh) => !mesh.parent) ?? baseResult.meshes[0]) as TransformNode;
  const collectedClips: Partial<Record<ClipKey, AnimationGroup>> = {};
  const clipManifest = options.clipManifest;
  const baseSkeletons: Skeleton[] = baseResult.skeletons ?? [];
  const transformLookup = new Map<string, TransformNode>();

  for (const mesh of baseResult.meshes) {
    if (mesh && typeof mesh.name === "string") {
      transformLookup.set(mesh.name, mesh as TransformNode);
    }
  }

  if (Array.isArray(baseResult.transformNodes)) {
    for (const node of baseResult.transformNodes) {
      if (node && typeof node.name === "string") {
        transformLookup.set(node.name, node);
      }
    }
  }

  const skeletonLookup = new Map<string, Skeleton>();
  for (const skeleton of baseSkeletons) {
    if (skeleton && typeof skeleton.name === "string") {
      skeletonLookup.set(skeleton.name, skeleton);
    }
  }

  if (baseResult.animationGroups.length > 0) {
    const baseClip = baseResult.animationGroups[0];
    baseClip.stop();
    baseClip.reset();
    stripRootMotionFromGroup(baseClip, rootMesh);
    collectedClips.idle = baseClip;
  }

  for (const { key, file } of clipManifest) {
    try {
      const container: AssetContainer = await SceneLoader.LoadAssetContainerAsync(
        options.assetPath,
        file,
        scene
      );
      container.addAllToScene();

      const importedGroups = container.animationGroups;
      if (importedGroups.length > 0) {
        const primaryGroup = importedGroups[0];
        const cloned = primaryGroup.clone(`${options.movementRootName}-${key}`, (target: any) => {
          if (target instanceof TransformNode || target instanceof AbstractMesh) {
            const mappedNode = transformLookup.get(target.name);
            return mappedNode ?? target;
          }

          if (target instanceof Skeleton) {
            const skeletonMatch = skeletonLookup.get(target.name) ?? baseSkeletons[0];
            return skeletonMatch ?? target;
          }

          if (target instanceof Bone) {
            const sourceSkeleton = target.getSkeleton();
            const targetSkeleton =
              (sourceSkeleton && skeletonLookup.get(sourceSkeleton.name ?? "")) ?? baseSkeletons[0];
            const boneMatch = targetSkeleton?.bones.find((bone) => bone.name === target.name);
            return boneMatch ?? target;
          }

          return target;
        });

        if (cloned) {
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

  const movementRoot = new TransformNode(options.movementRootName, scene);
  movementRoot.position.copyFrom(initialPosition);
  movementRoot.rotationQuaternion = null;
  movementRoot.rotation.copyFrom(initialRotation);
  movementRoot.scaling.copyFrom(initialScaling);
  movementRoot.rotation.y += Math.PI;

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

  console.log(`[QA] ${options.logLabel}:`, rootMesh.name, materialName);

  return { rootMesh: movementRoot, animator };
}

function isRootRelativeTransform(node: TransformNode, rootMesh: TransformNode): boolean {
  let depth = 0;
  let current: TransformNode | null = node;

  while (current) {
    if (current === rootMesh) {
      return depth <= 2;
    }

    const parent = current.parent;
    if (!parent) {
      return false;
    }

    depth += 1;
    if (depth > 4) {
      return false;
    }

    current = parent as TransformNode | null;
  }

  return false;
}

function stripRootMotionFromGroup(group: AnimationGroup, rootMesh: TransformNode): void {
  const animationsToRemove: AnimationGroup["targetedAnimations"][number]["animation"][] = [];

  for (const targeted of [...group.targetedAnimations]) {
    const animation = targeted.animation;
    if (!animation || typeof animation.targetProperty !== "string") {
      continue;
    }

    const property = animation.targetProperty.toLowerCase();
    const affectsPosition = property.includes("position") || property.includes("translation");
    const target = targeted.target;
    const isRootMesh = target === rootMesh;
    const isRootTransform =
      target instanceof TransformNode && isRootRelativeTransform(target, rootMesh);
    const isRootBone = target instanceof Bone && !target.getParent();

    if (!isRootMesh && !isRootBone && !isRootTransform) {
      continue;
    }

    if ((isRootMesh || isRootTransform) && affectsPosition) {
      animationsToRemove.push(animation);
      continue;
    }

    const keys = animation.getKeys();
    if (keys.length === 0 || !affectsPosition) {
      continue;
    }

    for (const key of keys) {
      if (typeof key.value === "number") {
        key.value = 0;
      } else if (key.value instanceof Vector3) {
        key.value = Vector3.Zero();
      } else if (
        typeof key.value === "object" &&
        key.value !== null &&
        "x" in key.value &&
        "y" in key.value &&
        "z" in key.value
      ) {
        key.value = Vector3.Zero();
      }
    }
  }

  for (const animation of animationsToRemove) {
    group.removeTargetedAnimation(animation);
  }
}
