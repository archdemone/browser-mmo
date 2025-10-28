import { Engine } from "babylonjs";
import type { SceneBase } from "../scenes/SceneBase";
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
    let canvas: HTMLCanvasElement | null = document.getElementById("renderCanvas") as HTMLCanvasElement | null;
    if (!canvas) {
      console.error("[QA] Game.start() missing #renderCanvas, creating fallback canvas.");
      canvas = document.createElement("canvas");
      canvas.id = "renderCanvas";
      canvas.style.width = "100%";
      canvas.style.height = "100%";
      document.body.appendChild(canvas);
    }

    this.engine = new Engine(canvas, true);
    this.sceneManager = new SceneManager(this.engine);

    try {
      await this.sceneManager.goToHideout();
    } catch (error) {
      console.error("[QA] Game.start() failed to load HideoutScene", error);
      throw error;
    }

    this.lastFrameTime = performance.now();
    console.log("[QA] Game.start() reached runRenderLoop");

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

    const activeScene: SceneBase | null = this.sceneManager.getActiveScene();
    if (!activeScene) {
      return;
    }

    try {
      activeScene.update(deltaTime);
      activeScene.getScene().render();
    } catch (error) {
      console.error("[QA] Game render loop error", error);
    }
  }
}
