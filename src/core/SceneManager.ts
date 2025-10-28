import type { Engine } from "babylonjs";
import { DungeonScene } from "../scenes/DungeonScene";
import { HideoutScene } from "../scenes/HideoutScene";
import type { SceneBase } from "../scenes/SceneBase";

/**
 * Central coordinator for high-level scene transitions.
 */
export class SceneManager {
  private readonly engine: Engine;
  private activeScene: SceneBase | null = null;
  private transitionPromise: Promise<void> | null = null;

  constructor(engine: Engine) {
    this.engine = engine;
  }

  /**
   * Transition into the hideout scene.
   */
  async goToHideout(): Promise<void> {
    await this.transitionTo(() => new HideoutScene(this));
  }

  /**
   * Transition into the dungeon scene.
   */
  async goToDungeon(): Promise<void> {
    await this.transitionTo(() => new DungeonScene(this));
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
    if (this.transitionPromise) {
      console.warn("[QA] Scene transition requested while another is in progress");
      return this.transitionPromise;
    }

    const execute = async (): Promise<void> => {
      if (this.activeScene) {
        try {
          this.activeScene.dispose();
        } catch (error) {
          console.warn("[QA] SceneManager failed to dispose previous scene cleanly", error);
        }
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
    };

    const transition = execute();
    this.transitionPromise = transition.finally(() => {
      this.transitionPromise = null;
    });

    await this.transitionPromise;
  }
}
