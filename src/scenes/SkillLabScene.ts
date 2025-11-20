import type { Engine, Scene } from "babylonjs";
import type { SceneManager } from "../core/SceneManager";
import type { SceneBase } from "./SceneBase";
import { HideoutScene } from "./HideoutScene";

/**
 * Dedicated scene wrapper for the Skill Lab so it does not reuse the primary hideout session.
 */
export class SkillLabScene implements SceneBase {
  private readonly hideoutDelegate: HideoutScene;

  constructor(sceneManager: SceneManager) {
    this.hideoutDelegate = new HideoutScene(sceneManager, { mode: "skillLab" });
  }

  load(engine: Engine): Promise<void> | void {
    return this.hideoutDelegate.load(engine);
  }

  update(deltaTime: number): void {
    this.hideoutDelegate.update(deltaTime);
  }

  getScene(): Scene {
    return this.hideoutDelegate.getScene();
  }

  dispose(): void {
    this.hideoutDelegate.dispose();
  }
}
