import {
  ArcRotateCamera,
  Color3,
  Color4,
  Engine,
  HemisphericLight,
  MeshBuilder,
  Scene,
  StandardMaterial,
  Vector3,
  Scalar,
  type LinesMesh,
} from "babylonjs";
import type { SceneManager } from "../core/SceneManager";
import type { SceneBase } from "./SceneBase";

/**
 * Development-only level editor scene with a designer-friendly camera and build grid.
 */
export class EditorScene implements SceneBase {
  private readonly sceneManager: SceneManager;
  private scene: Scene | null = null;
  private camera: ArcRotateCamera | null = null;
  private cameraTarget: Vector3 = Vector3.Zero();
  private grid: LinesMesh | null = null;
  private readonly pressedKeys: Set<string> = new Set();
  private zoomInHeld: boolean = false;
  private zoomOutHeld: boolean = false;
  private wheelZoomDelta: number = 0;
  private readonly gridSize: number = 2.4;
  private readonly panSpeed: number = 18;
  private readonly zoomKeySpeed: number = 25;
  private readonly zoomWheelFactor: number = 0.01;
  private readonly minZoom: number = 10;
  private readonly maxZoom: number = 100;
  private keyDownHandler: (event: KeyboardEvent) => void = () => {};
  private keyUpHandler: (event: KeyboardEvent) => void = () => {};
  private wheelHandler: (event: WheelEvent) => void = () => {};

  constructor(sceneManager: SceneManager) {
    this.sceneManager = sceneManager;
  }

  async load(engine: Engine): Promise<void> {
    this.scene = new Scene(engine);
    this.scene.clearColor = new Color4(0.02, 0.02, 0.02, 1);

    const cameraTarget = new Vector3(0, 0, 0);
    this.cameraTarget = cameraTarget;
    const camera = new ArcRotateCamera(
      "EditorCamera",
      Math.PI * 1.25,
      Math.PI / 3.2,
      45,
      cameraTarget.clone(),
      this.scene
    );
    camera.lowerRadiusLimit = this.minZoom;
    camera.upperRadiusLimit = this.maxZoom;
    camera.panningSensibility = Infinity;
    camera.allowUpsideDown = false;
    camera.useAutoRotationBehavior = false;
    camera.inputs.clear();

    const canvas = engine.getRenderingCanvas();
    if (canvas) {
      camera.attachControl(canvas, true);
    } else {
      console.warn("[EditorScene] rendering canvas missing during load");
    }

    this.camera = camera;
    this.scene.activeCamera = camera;

    this.createLighting();
    this.createGrid();
    this.registerEventListeners();
  }

  update(deltaTime: number): void {
    if (!this.scene || !this.camera) {
      return;
    }

    const moveVector = this.computeMoveVector();
    if (moveVector) {
      moveVector.normalize();
      moveVector.scaleInPlace(this.panSpeed * deltaTime);
      this.cameraTarget.addInPlace(moveVector);
      this.camera.setTarget(this.cameraTarget);
    }

    const zoomChange = this.consumeZoomChange(deltaTime);
    if (zoomChange !== 0) {
      const newRadius = Scalar.Clamp(
        this.camera.radius + zoomChange,
        this.minZoom,
        this.maxZoom
      );
      this.camera.radius = newRadius;
    }
  }

  getScene(): Scene {
    if (!this.scene) {
      throw new Error("EditorScene has not been initialized");
    }

    return this.scene;
  }

  dispose(): void {
    this.unregisterEventListeners();
    this.grid = null;
    this.camera = null;
    this.cameraTarget = Vector3.Zero();
    this.pressedKeys.clear();
    this.zoomInHeld = false;
    this.zoomOutHeld = false;
    this.wheelZoomDelta = 0;

    if (this.scene) {
      this.scene.dispose();
      this.scene = null;
    }
  }

  private createLighting(): void {
    if (!this.scene) {
      return;
    }

    const light = new HemisphericLight("EditorHemi", new Vector3(0, 1, 0), this.scene);
    light.intensity = 0.8;
    light.diffuse = new Color3(0.9, 0.85, 0.8);
    light.specular = new Color3(0.1, 0.1, 0.1);
  }

  private createGrid(): void {
    if (!this.scene) {
      return;
    }

    const gridExtentTiles = 40;
    const halfExtent = gridExtentTiles * this.gridSize;

    const ground = MeshBuilder.CreateGround(
      "EditorGround",
      { width: halfExtent * 2, height: halfExtent * 2 },
      this.scene
    );
    ground.position.y = -0.01;
    ground.isPickable = false;

    const groundMaterial = new StandardMaterial("EditorGroundMat", this.scene);
    groundMaterial.diffuseColor = new Color3(0.05, 0.05, 0.06);
    groundMaterial.specularColor = Color3.Black();
    ground.material = groundMaterial;

    const lines: Vector3[][] = [];
    for (let i = -gridExtentTiles; i <= gridExtentTiles; i++) {
      const offset = i * this.gridSize;
      lines.push([
        new Vector3(offset, 0, -halfExtent),
        new Vector3(offset, 0, halfExtent),
      ]);
    }

    for (let j = -gridExtentTiles; j <= gridExtentTiles; j++) {
      const offset = j * this.gridSize;
      lines.push([
        new Vector3(-halfExtent, 0, offset),
        new Vector3(halfExtent, 0, offset),
      ]);
    }

    const grid = MeshBuilder.CreateLineSystem(
      "EditorGrid",
      { lines, useVertexAlpha: false },
      this.scene
    );
    grid.color = new Color3(0.35, 0.35, 0.4);
    grid.alpha = 0.85;
    grid.isPickable = false;
    this.grid = grid;
  }

  private registerEventListeners(): void {
    this.keyDownHandler = (event: KeyboardEvent) => {
      if (this.handleZoomKeys(event, true)) {
        event.preventDefault();
        return;
      }

      if (this.isPanKey(event.code)) {
        this.pressedKeys.add(event.code);
        event.preventDefault();
      }
    };

    this.keyUpHandler = (event: KeyboardEvent) => {
      if (this.handleZoomKeys(event, false)) {
        event.preventDefault();
        return;
      }

      if (this.isPanKey(event.code)) {
        this.pressedKeys.delete(event.code);
        event.preventDefault();
      }
    };

    this.wheelHandler = (event: WheelEvent) => {
      this.wheelZoomDelta += event.deltaY;
      event.preventDefault();
    };

    window.addEventListener("keydown", this.keyDownHandler, { capture: true });
    window.addEventListener("keyup", this.keyUpHandler, { capture: true });
    window.addEventListener("wheel", this.wheelHandler, { passive: false });
  }

  private unregisterEventListeners(): void {
    window.removeEventListener("keydown", this.keyDownHandler, { capture: true });
    window.removeEventListener("keyup", this.keyUpHandler, { capture: true });
    window.removeEventListener("wheel", this.wheelHandler as EventListener);
  }

  private computeMoveVector(): Vector3 | null {
    let x = 0;
    let z = 0;

    if (this.pressedKeys.has("KeyW") || this.pressedKeys.has("ArrowUp")) {
      z += 1;
    }

    if (this.pressedKeys.has("KeyS") || this.pressedKeys.has("ArrowDown")) {
      z -= 1;
    }

    if (this.pressedKeys.has("KeyD") || this.pressedKeys.has("ArrowRight")) {
      x += 1;
    }

    if (this.pressedKeys.has("KeyA") || this.pressedKeys.has("ArrowLeft")) {
      x -= 1;
    }

    if (x === 0 && z === 0) {
      return null;
    }

    return new Vector3(x, 0, z);
  }

  private consumeZoomChange(deltaTime: number): number {
    let zoomDelta = 0;

    if (this.zoomInHeld) {
      zoomDelta -= this.zoomKeySpeed * deltaTime;
    }

    if (this.zoomOutHeld) {
      zoomDelta += this.zoomKeySpeed * deltaTime;
    }

    if (this.wheelZoomDelta !== 0) {
      zoomDelta += this.wheelZoomDelta * this.zoomWheelFactor;
      this.wheelZoomDelta = 0;
    }

    return zoomDelta;
  }

  private handleZoomKeys(event: KeyboardEvent, keyDown: boolean): boolean {
    switch (event.code) {
      case "Equal":
      case "NumpadAdd":
        this.zoomInHeld = keyDown;
        return true;
      case "Minus":
      case "NumpadSubtract":
        this.zoomOutHeld = keyDown;
        return true;
      default:
        return false;
    }
  }

  private isPanKey(code: string): boolean {
    switch (code) {
      case "KeyW":
      case "KeyA":
      case "KeyS":
      case "KeyD":
      case "ArrowUp":
      case "ArrowDown":
      case "ArrowLeft":
      case "ArrowRight":
        return true;
      default:
        return false;
    }
  }
}
