import type { AnimationGroup, IAnimatable, ISceneLoaderAsyncResult, Node, Scene, TransformNode } from "babylonjs";
import { Bone, SceneLoader } from "babylonjs";
import "babylonjs-loaders";
import { PlayerAnimator } from "./PlayerAnimator";

interface PlayerCharacterResult {
  rootMesh: TransformNode;
  animator: PlayerAnimator;
}

interface EnemyCharacterResult {
  rootMesh: TransformNode;
  animator: PlayerAnimator | null;
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
  const baseSkeleton = (baseResult.skeletons && baseResult.skeletons[0]) ? baseResult.skeletons[0] : null;
  // Stop and dispose any animation groups that came with the base model to avoid auto-play conflicts
  for (const g of baseResult.animationGroups ?? []) {
    try { g.stop(); } catch {}
    g.dispose();
  }

  // Build a lookup for retargeting by node name within the base character hierarchy only
  const baseNodeByName = new Map<string, Node>();
  const baseBoneByName = new Map<string, Bone>();
  const collectNodes = (node: Node): void => {
    if (!node) return;
    if (node.name) baseNodeByName.set(node.name, node);
    const children = (node as TransformNode).getChildren?.() ?? [];
    for (const c of children) collectNodes(c as unknown as Node);
  };
  collectNodes(rootMesh as unknown as Node);
  if (baseSkeleton) {
    for (const b of baseSkeleton.bones) {
      if (b.name) baseBoneByName.set(b.name, b);
    }
  }

  const retarget = (oldTarget: IAnimatable): IAnimatable | null => {
    const anyTarget = oldTarget as unknown as { name?: string; getClassName?: () => string };
    const name = anyTarget.name ?? "";
    const className = anyTarget.getClassName ? anyTarget.getClassName() : "";

    // Map Bones by name to the base skeleton bones
    if (className === "Bone" && baseSkeleton) {
      const bone = baseBoneByName.get(name);
      return (bone as unknown as IAnimatable) ?? null;
    }

    // Map TransformNodes/Nodes by name into the base character hierarchy
    const node = baseNodeByName.get(name);
    return (node as unknown as IAnimatable) ?? null;
  };

  // Helper to import animation-only GLBs, retarget their groups to the base, and dispose temporary nodes
  const importAndRetarget = async (url: string, label: string): Promise<AnimationGroup[]> => {
    const res = await SceneLoader.ImportMeshAsync("", "", url, scene);
    const clones: AnimationGroup[] = [];
    for (const ag of res.animationGroups) {
      const clone = ag.clone(`${label}`, retarget);
      clone.stop();
      clones.push(clone);
      ag.dispose();
    }
    // Dispose imported meshes/nodes so duplicates do not remain visible
    for (const m of res.meshes) {
      if (m !== rootMesh) m.dispose(true, true);
    }
    for (const tn of res.transformNodes) {
      if (tn !== rootMesh) tn.dispose(true, true);
    }
    // Dispose imported skeletons as well to avoid duplicates lingering
    for (const s of res.skeletons ?? []) {
      s.dispose();
    }
    return clones;
  };

  // Attempt to load locomotion and action clips. Missing optional clips must not crash.
  await importAndRetarget(playerIdleUrl, "idle");
  await importAndRetarget(playerRunUrl, "run");

  // Optional clips: try/catch to avoid breaking load when missing in dev
  try {
    await importAndRetarget(playerSprintUrl, "sprint");
  } catch (e) {
    console.warn("[QA] Missing sprint animation clip, will fall back to run.", e);
  }
  try {
    await importAndRetarget(playerDodgeUrl, "dodge");
  } catch (e) {
    console.warn("[QA] Missing dodge animation clip; dodge will be unavailable.", e);
  }
  try {
    await importAndRetarget(playerAttackUrl, "attack");
  } catch (e) {
    console.warn("[QA] Missing attack animation clip; attack will be unavailable.", e);
  }

    // Heuristic name matcher: supports common Mixamo/variant terms
  const findGroup = (keyword: string): AnimationGroup | undefined => {
    const lowerKeyword = keyword.toLowerCase();
    const synonyms: Record<string, string[]> = {
      idle: ["idle", "stand", "rest", "breath"],
      run: ["run", "jog", "move", "walk"],
      sprint: ["sprint", "run_fast", "dash", "fast"],
      dodge: ["dodge", "roll", "evade", "tumble"],
      attack: ["attack", "slash", "swing", "strike", "punch"],
    };

    const candidates = synonyms[lowerKeyword] ?? [lowerKeyword];
    const groups = scene.animationGroups;

    // Prefer exact label match first (we relabeled cloned groups to canonical names)
    const exact = groups.find((g) => g.name.toLowerCase() === lowerKeyword);
    if (exact) return exact;

    // Then try synonyms by substring
    for (const term of candidates) {
      const hit = groups.find((g) => g.name.toLowerCase().includes(term));
      if (hit) return hit;
    }

    return undefined;
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

/**
 * Placeholder enemy factory. Replace with authored asset loading when available.
 */
export async function createEnemyCharacter(_scene: Scene): Promise<EnemyCharacterResult> {
  throw new Error("Enemy character assets are not configured yet.");
}

