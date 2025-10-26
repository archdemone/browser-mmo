import type { Engine, Scene } from "babylonjs";

/**
 * Shared contract for gameplay scenes rendered by the engine.
 */
export interface SceneBase {
  load(engine: Engine): Promise<void> | void;
  update(deltaTime: number): void;
  getScene(): Scene;
  dispose(): void;
}
