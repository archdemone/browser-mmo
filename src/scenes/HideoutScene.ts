import { SceneBase } from "./SceneBase";

export class HideoutScene extends SceneBase {
  // TODO: Show the player idle in a safe hideout environment.
  // TODO: Allow opening InventoryUI / PassiveTreeUI / SkillBarUI from this scene.
  // TODO: Provide interactions to enter a dungeon via SceneManager.

  async load(): Promise<void> {
    // TODO: Set up hideout-specific Babylon scene elements.
  }

  update(deltaTime: number): void {
    void deltaTime;
    // TODO: Handle hideout ambient updates and UI interactions.
  }

  dispose(): void {
    // TODO: Tear down hideout resources.
  }
}
