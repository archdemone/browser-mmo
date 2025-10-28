import type { Engine } from "babylonjs";
import { DungeonScene } from "../scenes/DungeonScene";
import type { SceneBase } from "../scenes/SceneBase";

/**
 * Central coordinator for high-level scene transitions.
 */
export class SceneManager {
  private readonly engine: Engine;
  private activeScene: SceneBase | null = null;

  constructor(engine: Engine) {
    this.engine = engine;
  }

  /**
   * Transition into the dungeon scene.
   */
  async goToDungeon(): Promise<void> {
    await this.transitionTo(() => new DungeonScene());
  }

  /**
   * Retrieve the currently active gameplay scene.
   */
  getActiveScene(): SceneBase | null {
    return this.activeScene;
  }

  /**
   * Propagate per-frame updates to the active scene.
   */
  update(deltaTime: number): void {
    this.activeScene?.update(deltaTime);
  }

  private async transitionTo(factory: () => SceneBase): Promise<void> {
    if (this.activeScene) {
      this.activeScene.dispose();
      this.activeScene = null;
    }

    const nextScene: SceneBase = factory();
    try {
      await nextScene.load(this.engine);
      this.activeScene = nextScene;
    } catch (error) {
      console.error("[QA] SceneManager failed to activate scene", error);
      nextScene.dispose();
      throw error;
    }
  }
}
