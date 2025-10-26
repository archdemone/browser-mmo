import { Engine, Scene } from "babylonjs";
import { SceneManager } from "./SceneManager";

/**
 * Core game bootstrapper responsible for engine lifecycle and frame updates.
 */
export class Game {
  private engine: Engine | null = null;
  private sceneManager: SceneManager | null = null;
  private lastFrameTime: number = 0;

  /**
   * Start the game by creating the Babylon engine, loading the initial scene, and starting the render loop.
   */
  async start(): Promise<void> {
    const canvas: HTMLCanvasElement | null = document.getElementById("renderCanvas") as HTMLCanvasElement | null;
    if (!canvas) {
      throw new Error("#renderCanvas element not found");
    }

    this.engine = new Engine(canvas, true);
    this.sceneManager = new SceneManager();

    await this.sceneManager.goToDungeon(this.engine);

    this.lastFrameTime = performance.now();
    this.engine.runRenderLoop(() => {
      this.renderLoop();
    });

    window.addEventListener("resize", () => {
      this.engine?.resize();
    });
  }

  private renderLoop(): void {
    if (!this.engine || !this.sceneManager) {
      return;
    }

    const currentTime: number = performance.now();
    const deltaTime: number = (currentTime - this.lastFrameTime) / 1000;
    this.lastFrameTime = currentTime;

    this.sceneManager.update(deltaTime);

    const scene: Scene | null = this.sceneManager.getActiveScene();
    scene?.render();
  }
}
