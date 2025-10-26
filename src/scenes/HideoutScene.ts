import type { Engine, Scene } from "babylonjs";
import { Scene as BabylonScene } from "babylonjs";
import type { SceneBase } from "./SceneBase";

export class HideoutScene implements SceneBase {
  private scene: Scene | null = null;

  // TODO: Show the player idle in a safe hideout environment.
  // TODO: Allow opening InventoryUI / PassiveTreeUI / SkillBarUI from this scene.
  // TODO: Provide interactions to enter a dungeon via SceneManager.

  async load(engine: Engine): Promise<void> {
    this.scene = new BabylonScene(engine);
  }

  update(deltaTime: number): void {
    void deltaTime;
    // TODO: Handle hideout ambient updates and UI interactions.
  }

  getScene(): Scene {
    if (!this.scene) {
      throw new Error("HideoutScene has not been initialized");
    }

    return this.scene;
  }

  dispose(): void {
    this.scene?.dispose();
    this.scene = null;
  }
}
