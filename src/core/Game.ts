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

    // Attach mouse event listener to canvas after engine creation
    setTimeout(() => {
      if (canvas) {
        const canvasClickHandler = (event: MouseEvent) => {
          if (event.button === 0) {
            console.log(`[INPUT] Canvas left-click detected`);
            const attackButton = document.querySelector('.attack-button') as HTMLElement;
            if (attackButton) {
              console.log(`[INPUT] Simulating attack button click from canvas`);
              attackButton.click();
              // Don't prevent default to avoid interfering with Babylon.js
            } else {
              console.log(`[INPUT] Attack button not found, trying global input`);
              // Fallback: try to access the global input object
              const globalInput = (window as any).__qaInput;
              if (globalInput) {
                globalInput.attackQueued = true;
                console.log(`[INPUT] Set attackQueued via global input`);
              }
            }
          }
        };
        canvas.addEventListener('mousedown', canvasClickHandler);
        console.log(`[INPUT] Canvas click listener attached`);
      }
    }, 100);

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
