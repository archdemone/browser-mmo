import type { Engine, Scene } from "babylonjs";
import { DungeonScene } from "../scenes/DungeonScene";
import type { SceneBase } from "../scenes/SceneBase";

/**
 * Central coordinator for high-level scene transitions.
 */
export class SceneManager {
  private activeScene: SceneBase | null = null;

  /**
   * Transition into the dungeon scene.
   */
  async goToDungeon(engine: Engine): Promise<void> {
    const newScene: DungeonScene = new DungeonScene();
    await this.setActiveScene(newScene, engine);
  }

  /**
   * Retrieve the currently active Babylon scene for rendering.
   */
  getActiveScene(): Scene | null {
    return this.activeScene ? this.activeScene.getScene() : null;
  }

  /**
   * Propagate per-frame updates to the active scene.
   */
  update(deltaTime: number): void {
    this.activeScene?.update(deltaTime);
  }

  private async setActiveScene(scene: SceneBase, engine: Engine): Promise<void> {
    if (this.activeScene) {
      this.activeScene.dispose();
    }

    this.activeScene = scene;
    await scene.load(engine);
  }
}
