// Base class for Babylon scenes in this game.
// TODO: Provide shared references to engine, scene graph, and common services.

export abstract class SceneBase {
  abstract load(): Promise<void> | void;
  abstract update(deltaTime: number): void;
  abstract dispose(): void;
}
