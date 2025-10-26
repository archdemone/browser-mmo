import { SceneBase } from "./SceneBase";

export class DungeonScene extends SceneBase {
  // TODO: Spawn the player runtime actor using PlayerProfile stats.
  // TODO: Attach CameraRig to follow the player in the dungeon.
  // TODO: Spawn enemies appropriate for the dungeon depth/seed.
  // TODO: Run CombatSystem and AbilitySystem logic each frame.
  // TODO: Award XP and loot, updating the PlayerProfile as encounters resolve.

  async load(): Promise<void> {
    // TODO: Set up dungeon environment, navmesh, and enemy spawners.
  }

  update(deltaTime: number): void {
    void deltaTime;
    // TODO: Tick combat, abilities, AI, and loot drops.
  }

  dispose(): void {
    // TODO: Clean up dungeon-specific entities and resources.
  }
}
