import type { Engine } from "babylonjs";
import { DungeonScene } from "../scenes/DungeonScene";
import { EditorScene } from "../scenes/EditorScene";
import { HideoutScene } from "../scenes/HideoutScene";
import type { SceneBase } from "../scenes/SceneBase";
import type { PlacedEntity } from "../scenes/layouts/LayoutTypes";
import { DEBUG_EDITOR } from "./DebugFlags";

/**
 * Central coordinator for high-level scene transitions.
 */
export class SceneManager {
  private readonly engine: Engine;
  private activeScene: SceneBase | null = null;
  private transitionPromise: Promise<void> | null = null;
  private readonly debugKeyHandler: ((event: KeyboardEvent) => void) | null = null;

  constructor(engine: Engine) {
    this.engine = engine;

    if (DEBUG_EDITOR && typeof window !== "undefined") {
      this.debugKeyHandler = (event: KeyboardEvent) => {
        if (event.repeat) {
          return;
        }

        if (event.code === "F6" && this.activeScene instanceof HideoutScene) {
          event.preventDefault();
          void this.goToEditor();
          return;
        }

        if (event.code === "F6" && this.activeScene instanceof DungeonScene) {
          event.preventDefault();
          void this.goToEditor();
          return;
        }

        if (event.code === "F5" && (this.activeScene instanceof EditorScene || this.activeScene instanceof DungeonScene)) {
          event.preventDefault();
          void this.goToHideout();
        }
      };

      window.addEventListener("keydown", this.debugKeyHandler, { capture: true });
    }
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
   * Transition into the dungeon scene using a serialized layout.
   */
  async goToDungeonFromLayout(layoutData: PlacedEntity[]): Promise<void> {
    await this.transitionTo(() => new DungeonScene(this, layoutData));
  }

  /**
   * Transition into the development editor scene.
   */
  async goToEditor(): Promise<void> {
    await this.transitionTo(() => new EditorScene(this));
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
        this.decorateSceneForQa(nextScene);
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

  private decorateSceneForQa(scene: SceneBase): void {
    const qaLabel = this.resolveSceneLabel(scene);

    try {
      Object.defineProperty(scene, "constructor", {
        value: { name: qaLabel },
        configurable: true,
      });
    } catch (error) {
      console.warn("[QA] Failed to tag scene constructor", qaLabel, error);
    }

    if (typeof window !== "undefined") {
      (window as unknown as { __qaActiveSceneName?: string }).__qaActiveSceneName = qaLabel;
    }
  }

  private resolveSceneLabel(scene: SceneBase): string {
    if (scene instanceof HideoutScene) {
      return "HideoutScene";
    }
    if (scene instanceof EditorScene) {
      return "EditorScene";
    }
    if (scene instanceof DungeonScene) {
      return "DungeonScene";
    }
    return scene.constructor?.name ?? "UnknownScene";
  }
}
