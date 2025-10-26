import type { HideoutScene } from "../scenes/HideoutScene";
import type { DungeonScene } from "../scenes/DungeonScene";

export interface SceneController {
  load(): Promise<void> | void;
  update(deltaTime: number): void;
  dispose(): void;
}

// TODO: Manage transitions between HideoutScene and DungeonScene, handling save/load boundaries.
export class SceneManager {
  private currentScene: SceneController | null = null;

  // TODO: Keep references or factories for HideoutScene and DungeonScene here.
  private hideoutScene: HideoutScene | null = null;
  private dungeonScene: DungeonScene | null = null;

  async switchTo(scene: SceneController): Promise<void> {
    if (this.currentScene) {
      this.currentScene.dispose();
    }

    this.currentScene = scene;
    await scene.load();
  }

  update(deltaTime: number): void {
    this.currentScene?.update(deltaTime);
  }

  // TODO: Implement helpers to go from hideout → dungeon → hideout with state handoff.
}
