import {
  AbstractMesh,
  ArcRotateCamera,
  Color3,
  Color4,
  Engine,
  HemisphericLight,
  LinesMesh,
  Matrix,
  Mesh,
  MeshBuilder,
  Nullable,
  Observer,
  PickingInfo,
  Plane,
  PointerEventTypes,
  PointerInfo,
  Scene,
  Scalar,
  StandardMaterial,
  Vector3,
  MeshBuilder,
  Scene,
  StandardMaterial,
  Vector3,
  Scalar,
  type LinesMesh,
} from "babylonjs";
import type { SceneManager } from "../core/SceneManager";
import type { SceneBase } from "./SceneBase";

type BrushType =
  | "floor"
  | "wall"
  | "ramp"
  | "pillar"
  | "prop_crate"
  | "prop_bones"
  | "enemy_spawn"
  | "player_spawn";

type EditorMeshMetadata = {
  editorBrushType: BrushType;
  yOffset: number;
  baseRotation: Vector3;
};

/**
 * Development-only level editor scene with a designer-friendly camera and build grid.
 */
export class EditorScene implements SceneBase {
  private readonly sceneManager: SceneManager;
  private scene: Scene | null = null;
  private camera: ArcRotateCamera | null = null;
  private canvas: HTMLCanvasElement | null = null;
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
  private readonly brushTypes: BrushType[] = [
    "floor",
    "wall",
    "ramp",
    "pillar",
    "prop_crate",
    "prop_bones",
    "enemy_spawn",
    "player_spawn",
  ];
  private currentBrushType: BrushType = "floor";
  private paletteRoot: HTMLDivElement | null = null;
  private paletteButtons: Map<BrushType, HTMLButtonElement> = new Map();
  private currentBrushLabel: HTMLDivElement | null = null;
  private ghostMesh: Mesh | null = null;
  private ghostMaterial: StandardMaterial | null = null;
  private ghostPosition: Vector3 | null = null;
  private ghostRotationIndex: number = 0;
  private readonly groundPlane: Plane = new Plane(0, 1, 0, 0);
  private pointerObserver: Nullable<Observer<PointerInfo>> = null;
  private contextMenuHandler: ((event: MouseEvent) => void) | null = null;
  private readonly placedMeshes: Mesh[] = [];
  private undoStack: Mesh[] = [];
  private readonly brushMaterials: Map<BrushType, StandardMaterial> = new Map();
  private placementCounter: number = 0;
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
      this.canvas = canvas;
      camera.attachControl(canvas, true);
      this.contextMenuHandler = (event: MouseEvent) => {
        event.preventDefault();
      };
      canvas.addEventListener("contextmenu", this.contextMenuHandler);
      camera.attachControl(canvas, true);
    } else {
      console.warn("[EditorScene] rendering canvas missing during load");
    }

    this.camera = camera;
    this.scene.activeCamera = camera;

    this.createLighting();
    this.createGrid();
    this.buildPaletteUI();
    this.setCurrentBrush(this.currentBrushType);
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

    this.updateGhostFromPointer();
    this.updateGhostVisuals();
  }

  getScene(): Scene {
    if (!this.scene) {
      throw new Error("EditorScene has not been initialized");
    }

    return this.scene;
  }

  dispose(): void {
    this.unregisterEventListeners();

    if (this.ghostMesh) {
      this.ghostMesh.dispose();
      this.ghostMesh = null;
    }

    if (this.ghostMaterial) {
      this.ghostMaterial.dispose();
      this.ghostMaterial = null;
    }

    for (const mesh of this.placedMeshes.splice(0, this.placedMeshes.length)) {
      mesh.dispose();
    }
    this.undoStack = [];
    this.brushMaterials.clear();
    this.placementCounter = 0;

    this.disposePaletteUI();

    if (this.canvas && this.contextMenuHandler) {
      this.canvas.removeEventListener("contextmenu", this.contextMenuHandler);
    }
    this.canvas = null;
    this.contextMenuHandler = null;

    this.grid = null;
    this.camera = null;
    this.cameraTarget = Vector3.Zero();
    this.pressedKeys.clear();
    this.zoomInHeld = false;
    this.zoomOutHeld = false;
    this.wheelZoomDelta = 0;
    this.ghostPosition = null;
    this.ghostRotationIndex = 0;

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

  private buildPaletteUI(): void {
    if (typeof document === "undefined") {
      return;
    }

    const root = document.createElement("div");
    root.className = "editor-palette";
    Object.assign(root.style, {
      position: "absolute",
      top: "80px",
      left: "24px",
      display: "flex",
      flexDirection: "column",
      gap: "8px",
      padding: "12px",
      background: "rgba(14, 14, 18, 0.85)",
      border: "1px solid rgba(180, 150, 90, 0.45)",
      borderRadius: "6px",
      color: "#f5e6d6",
      fontFamily: "sans-serif",
      fontSize: "14px",
      zIndex: "10",
      maxHeight: "70vh",
      overflowY: "auto",
    });

    const title = document.createElement("div");
    title.textContent = "Editor Palette";
    title.style.fontWeight = "bold";
    title.style.marginBottom = "4px";
    root.appendChild(title);

    const buttonContainer = document.createElement("div");
    Object.assign(buttonContainer.style, {
      display: "grid",
      gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
      gap: "6px",
    });

    for (const brush of this.brushTypes) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = brush;
      Object.assign(button.style, {
        padding: "6px 8px",
        background: "rgba(50, 50, 56, 0.8)",
        color: "#f5e6d6",
        border: "1px solid rgba(210, 180, 110, 0.3)",
        borderRadius: "4px",
        cursor: "pointer",
        textTransform: "capitalize",
      });
      button.addEventListener("click", () => {
        this.setCurrentBrush(brush);
      });
      this.paletteButtons.set(brush, button);
      buttonContainer.appendChild(button);
    }

    root.appendChild(buttonContainer);

    const currentLabel = document.createElement("div");
    currentLabel.style.marginTop = "8px";
    currentLabel.style.fontWeight = "bold";
    root.appendChild(currentLabel);
    this.currentBrushLabel = currentLabel;

    document.body.appendChild(root);
    this.paletteRoot = root;
  }

  private disposePaletteUI(): void {
    this.paletteButtons.clear();
    if (this.paletteRoot?.parentElement) {
      this.paletteRoot.parentElement.removeChild(this.paletteRoot);
    }
    this.paletteRoot = null;
    this.currentBrushLabel = null;
  }

  private setCurrentBrush(brush: BrushType): void {
    if (this.currentBrushType === brush && this.ghostMesh) {
      return;
    }

    this.currentBrushType = brush;
    this.updatePaletteSelection();
    this.refreshBrushLabel();
    this.rebuildGhostMesh();
  }

  private updatePaletteSelection(): void {
    for (const [brush, button] of this.paletteButtons) {
      if (brush === this.currentBrushType) {
        button.style.background = "rgba(160, 120, 60, 0.85)";
        button.style.borderColor = "rgba(255, 220, 120, 0.7)";
      } else {
        button.style.background = "rgba(50, 50, 56, 0.8)";
        button.style.borderColor = "rgba(210, 180, 110, 0.3)";
      }
    }
  }

  private refreshBrushLabel(): void {
    if (this.currentBrushLabel) {
      this.currentBrushLabel.textContent = `Current: ${this.currentBrushType}`;
    }
  }

  private rebuildGhostMesh(): void {
    if (!this.scene) {
      return;
    }

    if (this.ghostMesh) {
      this.ghostMesh.dispose();
      this.ghostMesh = null;
    }

    if (this.ghostMaterial) {
      this.ghostMaterial.dispose();
      this.ghostMaterial = null;
    }

    try {
      const mesh = this.createBrushMesh(`${this.currentBrushType}_Ghost`, this.currentBrushType);
      mesh.isPickable = false;
      mesh.renderingGroupId = 2;

      const material = new StandardMaterial(`EditorGhostMat_${this.currentBrushType}`, this.scene);
      const color = this.getBrushColor(this.currentBrushType);
      material.diffuseColor = color.scale(0.6);
      material.emissiveColor = color.scale(0.9);
      material.specularColor = Color3.Black();
      material.alpha = 0.35;

      mesh.material = material;
      mesh.setEnabled(false);

      this.ghostMesh = mesh;
      this.ghostMaterial = material;
    } catch (error) {
      console.warn(`[EditorScene] Failed to create ghost mesh for ${this.currentBrushType}`, error);
      this.ghostMesh = null;
      this.ghostMaterial = null;
      return;
    }

    if (this.ghostPosition && this.ghostMesh) {
      this.applyBrushTransform(this.ghostMesh, this.ghostPosition, this.ghostRotationIndex);
      this.ghostMesh.setEnabled(true);
    }
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

    if (this.scene) {
      this.pointerObserver = this.scene.onPointerObservable.add((pointerInfo) => {
        switch (pointerInfo.type) {
          case PointerEventTypes.POINTERDOWN: {
            const event = pointerInfo.event as PointerEvent;
            if (event.button === 0) {
              this.handlePlacement();
              event.preventDefault();
            } else if (event.button === 2) {
              this.handleDeletion(pointerInfo.pickInfo ?? null);
              event.preventDefault();
            }
            break;
          }
          case PointerEventTypes.POINTEROUT:
            this.ghostPosition = null;
            this.updateGhostVisibility(false);
            break;
          default:
            break;
        }
      });
    }
  }

  private unregisterEventListeners(): void {
    window.removeEventListener("keydown", this.keyDownHandler, { capture: true });
    window.removeEventListener("keyup", this.keyUpHandler, { capture: true });
    window.removeEventListener("wheel", this.wheelHandler);

    if (this.scene && this.pointerObserver) {
      this.scene.onPointerObservable.remove(this.pointerObserver);
      this.pointerObserver = null;
    }
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

  private handleEditorShortcuts(event: KeyboardEvent): boolean {
    if (event.code === "KeyR" && !event.repeat) {
      this.rotateGhost();
      return true;
    }

    if (event.code === "KeyZ" && !event.repeat) {
      this.undoLastPlacement();
      return true;
    }

    return false;
  }

  private rotateGhost(): void {
    this.ghostRotationIndex = (this.ghostRotationIndex + 1) % 4;
    if (this.ghostMesh && this.ghostPosition) {
      this.applyBrushTransform(this.ghostMesh, this.ghostPosition, this.ghostRotationIndex);
    }
  }

  private undoLastPlacement(): void {
    while (this.undoStack.length > 0) {
      const mesh = this.undoStack.pop();
      if (!mesh) {
        continue;
      }
      this.removePlacedMesh(mesh);
      break;
    }
  }

  private updateGhostFromPointer(): void {
    if (!this.scene || !this.camera) {
      return;
    }

    if (this.scene.pointerX < 0 || this.scene.pointerY < 0) {
      this.ghostPosition = null;
      return;
    }

    try {
      const ray = this.scene.createPickingRay(
        this.scene.pointerX,
        this.scene.pointerY,
        Matrix.Identity(),
        this.camera
      );
      if (!ray) {
        this.ghostPosition = null;
        return;
      }
      const hitPoint = ray.intersectsPlane(this.groundPlane);
      if (!hitPoint) {
        this.ghostPosition = null;
        return;
      }

      const snapped = new Vector3(
        Math.round(hitPoint.x / this.gridSize) * this.gridSize,
        0,
        Math.round(hitPoint.z / this.gridSize) * this.gridSize
      );
      this.ghostPosition = snapped;
    } catch (error) {
      console.warn("[EditorScene] Failed to update ghost position", error);
      this.ghostPosition = null;
    }
  }

  private updateGhostVisuals(): void {
    if (!this.ghostMesh || !this.scene) {
      return;
    }

    if (!this.ghostPosition) {
      this.updateGhostVisibility(false);
      return;
    }

    this.applyBrushTransform(this.ghostMesh, this.ghostPosition, this.ghostRotationIndex);
    this.updateGhostVisibility(true);
  }

  private updateGhostVisibility(visible: boolean): void {
    if (!this.ghostMesh) {
      return;
    }
    this.ghostMesh.setEnabled(visible);
    this.ghostMesh.isVisible = visible;
  }

  private createBrushMesh(name: string, brushType: BrushType): Mesh {
    if (!this.scene) {
      throw new Error("EditorScene has no active scene for mesh creation");
    }

    let mesh: Mesh;
    let yOffset = 0;
    const baseRotation = new Vector3(0, 0, 0);

    switch (brushType) {
      case "floor": {
        const height = 0.2;
        mesh = MeshBuilder.CreateBox(
          name,
          { width: this.gridSize, height, depth: this.gridSize },
          this.scene
        );
        yOffset = height / 2;
        break;
      }
      case "wall": {
        const height = 3;
        mesh = MeshBuilder.CreateBox(
          name,
          { width: this.gridSize, height, depth: this.gridSize * 0.35 },
          this.scene
        );
        yOffset = height / 2;
        break;
      }
      case "ramp": {
        const height = this.gridSize * 0.4;
        mesh = MeshBuilder.CreateBox(
          name,
          { width: this.gridSize, height, depth: this.gridSize },
          this.scene
        );
        baseRotation.x = -Math.PI / 4;
        yOffset = height / 2;
        break;
      }
      case "pillar": {
        const height = 3;
        mesh = MeshBuilder.CreateCylinder(
          name,
          { height, diameter: this.gridSize * 0.45 },
          this.scene
        );
        yOffset = height / 2;
        break;
      }
      case "prop_crate": {
        const size = this.gridSize * 0.75;
        mesh = MeshBuilder.CreateBox(
          name,
          { width: size, height: size * 0.8, depth: size },
          this.scene
        );
        yOffset = (size * 0.8) / 2;
        break;
      }
      case "prop_bones": {
        const height = this.gridSize * 0.3;
        mesh = MeshBuilder.CreateCylinder(
          name,
          { height, diameter: this.gridSize * 0.6 },
          this.scene
        );
        yOffset = height / 2;
        break;
      }
      case "enemy_spawn": {
        const height = 0.3;
        mesh = MeshBuilder.CreateCylinder(
          name,
          { height, diameter: this.gridSize * 0.7 },
          this.scene
        );
        yOffset = height / 2;
        break;
      }
      case "player_spawn": {
        const height = 0.3;
        mesh = MeshBuilder.CreateCylinder(
          name,
          { height, diameter: this.gridSize * 0.7 },
          this.scene
        );
        yOffset = height / 2;
        break;
      }
      default:
        throw new Error(`Unsupported brush type: ${brushType}`);
    }

    const metadata: EditorMeshMetadata = {
      editorBrushType: brushType,
      yOffset,
      baseRotation: baseRotation.clone(),
    };
    mesh.metadata = metadata;
    mesh.isPickable = false;

    mesh.rotation.x = baseRotation.x;
    mesh.rotation.y = baseRotation.y;
    mesh.rotation.z = baseRotation.z;

    return mesh;
  }

  private getBrushColor(brush: BrushType): Color3 {
    switch (brush) {
      case "floor":
        return new Color3(0.45, 0.45, 0.5);
      case "wall":
        return new Color3(0.35, 0.32, 0.3);
      case "ramp":
        return new Color3(0.5, 0.36, 0.24);
      case "pillar":
        return new Color3(0.6, 0.55, 0.5);
      case "prop_crate":
        return new Color3(0.65, 0.45, 0.25);
      case "prop_bones":
        return new Color3(0.85, 0.8, 0.7);
      case "enemy_spawn":
        return new Color3(0.8, 0.2, 0.2);
      case "player_spawn":
        return new Color3(0.25, 0.6, 0.8);
      default:
        return new Color3(0.6, 0.6, 0.6);
    }
  }

  private applyBrushTransform(mesh: Mesh, position: Vector3, rotationIndex: number): void {
    const metadata = this.getMeshMetadata(mesh);
    const yOffset = metadata?.yOffset ?? 0;
    mesh.position.set(position.x, yOffset, position.z);

    const baseRotation = metadata?.baseRotation ?? Vector3.Zero();
    mesh.rotation.x = baseRotation.x;
    mesh.rotation.y = baseRotation.y + rotationIndex * (Math.PI / 2);
    mesh.rotation.z = baseRotation.z;
  }

  private getMeshMetadata(mesh: AbstractMesh): EditorMeshMetadata | null {
    const metadata = mesh.metadata as EditorMeshMetadata | undefined;
    if (metadata && typeof metadata === "object" && "editorBrushType" in metadata) {
      return metadata;
    }
    return null;
  }

  private getOrCreateBrushMaterial(brush: BrushType): StandardMaterial {
    if (!this.scene) {
      throw new Error("EditorScene has no active scene");
    }

    let material = this.brushMaterials.get(brush);
    if (!material) {
      material = new StandardMaterial(`EditorBrushMat_${brush}`, this.scene);
      const color = this.getBrushColor(brush);
      material.diffuseColor = color;
      material.emissiveColor = color.scale(0.35);
      material.specularColor = new Color3(0.1, 0.1, 0.1);
      this.brushMaterials.set(brush, material);
    }

    return material;
  }

  private handlePlacement(): void {
    if (!this.scene || !this.ghostPosition) {
      return;
    }

    try {
      const name = `EditorPlaced_${this.currentBrushType}_${this.placementCounter++}`;
      const mesh = this.createBrushMesh(name, this.currentBrushType);
      mesh.isPickable = true;
      mesh.material = this.getOrCreateBrushMaterial(this.currentBrushType);
      this.applyBrushTransform(mesh, this.ghostPosition, this.ghostRotationIndex);
      this.placedMeshes.push(mesh);
      this.undoStack.push(mesh);
    } catch (error) {
      console.warn(`[EditorScene] Failed to place ${this.currentBrushType}`, error);
    }
  }

  private handleDeletion(pickInfo: Nullable<PickingInfo>): void {
    if (!pickInfo || !pickInfo.hit || !pickInfo.pickedMesh) {
      return;
    }

    const mesh = this.findPlacedMesh(pickInfo.pickedMesh);
    if (!mesh) {
      return;
    }

    this.removePlacedMesh(mesh);
  }

  private findPlacedMesh(mesh: AbstractMesh): Mesh | null {
    let current: AbstractMesh | null = mesh;
    while (current) {
      if (current instanceof Mesh && this.placedMeshes.includes(current)) {
        return current;
      }
      current = (current.parent as AbstractMesh | null) ?? null;
    }
    return null;
  }

  private removePlacedMesh(mesh: Mesh): void {
    const placedIndex = this.placedMeshes.indexOf(mesh);
    if (placedIndex !== -1) {
      this.placedMeshes.splice(placedIndex, 1);
    }

    this.undoStack = this.undoStack.filter((entry) => entry !== mesh);

    if (!mesh.isDisposed()) {
      mesh.dispose();
    }
  }
}
