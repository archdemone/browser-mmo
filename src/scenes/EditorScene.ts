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
  PointLight,
  PointerEventTypes,
  PointerInfo,
  Scene,
  Scalar,
  StandardMaterial,
  Vector3,
  VertexData,
} from "babylonjs";
import type { SceneManager } from "../core/SceneManager";
import { HudUI } from "../ui/HudUI";
import { EffectsFactory } from "../visuals/EffectsFactory";
import { PostFXConfig } from "../visuals/PostFXConfig";
import {
  VisualPresetManager,
  type VisualControlId,
} from "../visuals/VisualPresetManager";
import type { SceneBase } from "./SceneBase";
import type { BrushType, LightParams, PlacedEntity } from "./layouts/LayoutTypes";
import { DEFAULT_FILL_LIGHT, DEFAULT_TORCH_LIGHT } from "./layouts/LayoutTypes";

const TILE_SIZE = 2.4;
const TILE_THICKNESS = 0.3;
const LEVEL_HEIGHT = 1.2;
const EPS = 0.01;
const WALL_THICKNESS_RATIO = 0.35;
const WALL_HEIGHT = 3;
const PILLAR_HEIGHT = 3;
const PROP_CRATE_SIZE = TILE_SIZE * 0.75;
const PROP_CRATE_HEIGHT = TILE_SIZE * 0.8;
const PROP_BONES_HEIGHT = TILE_SIZE * 0.3;
const SPAWN_HEIGHT = 0.3;
const LIGHT_TORCH_MARKER_HEIGHT = 1.4;
const LIGHT_TORCH_MARKER_DIAMETER = TILE_SIZE * 0.32;
const LIGHT_TORCH_LIGHT_OFFSET_Y = 0.5;
const LIGHT_FILL_MARKER_HEIGHT = TILE_THICKNESS * 1.5;
const LIGHT_FILL_MARKER_DIAMETER = TILE_SIZE * 0.95;
const LIGHT_FILL_LIGHT_HEIGHT = 2.4;

type EditorMeshMetadata = {
  editorBrushType: BrushType;
  baseRotation: Vector3;
  halfHeight: number;
  originOffset: number;
  supportsSnap: boolean;
  stackOffset: number;
  contributesTop: boolean;
  placementId?: string;
  rotationIndex?: number;
  level?: number;
  cellX?: number;
  cellZ?: number;
  topY?: number;
};

type EditorPlacementRecord = {
  id: string;
  brushType: BrushType;
  pos: { x: number; y: number; z: number };
  rotationIndex: number;
  level: number;
  cellX: number;
  cellZ: number;
  topY: number;
  params?: LightParams;
};

type BrushMetrics = {
  halfHeight: number;
  supportsSnap: boolean;
  contributesTop: boolean;
  stackOffset: number;
};

type PlacementContext = {
  brushType: BrushType;
  ix: number;
  iz: number;
  level: number;
  centerX: number;
  centerZ: number;
  rotationIndex: number;
  useSnap: boolean;
};

type PlacementResult = {
  position: Vector3;
  topY: number;
  baseY: number;
  supportTop: number | null;
  metrics: BrushMetrics;
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
  private currentElevationIndex: number = 0;
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
    "light_torch",
    "light_fill",
    "enemy_spawn",
    "player_spawn",
  ];
  private currentBrushType: BrushType = "floor";
  private paletteRoot: HTMLDivElement | null = null;
  private paletteButtons: Map<BrushType, HTMLButtonElement> = new Map();
  private currentBrushLabel: HTMLDivElement | null = null;
  private elevationLabel: HTMLDivElement | null = null;
  private ghostDebugLabel: HTMLDivElement | null = null;
  private ghostMesh: Mesh | null = null;
  private ghostMaterial: StandardMaterial | null = null;
  private ghostPosition: Vector3 | null = null;
  private ghostSnapCenter: Vector3 | null = null;
  private ghostCell: { ix: number; iz: number } | null = null;
  private pendingPlacement: PlacementContext | null = null;
  private pendingPlacementResult: PlacementResult | null = null;
  private ghostRotationIndex: number = 0;
  private readonly groundPlane: Plane = new Plane(0, 1, 0, 0);
  private pointerObserver: Nullable<Observer<PointerInfo>> = null;
  private contextMenuHandler: ((event: MouseEvent) => void) | null = null;
  private pointerLeaveHandler: ((event: PointerEvent) => void) | null = null;
  private readonly placedMeshes: Mesh[] = [];
  private readonly placedEntities: EditorPlacementRecord[] = [];
  private readonly cellTopHeights: Map<string, number> = new Map();
  private snapToTopEnabled: boolean = true;
  private undoStack: Mesh[] = [];
  private readonly brushMaterials: Map<BrushType, StandardMaterial> = new Map();
  private placementCounter: number = 0;
  private keyDownHandler: (event: KeyboardEvent) => void = () => {};
  private keyUpHandler: (event: KeyboardEvent) => void = () => {};
  private wheelHandler: (event: WheelEvent) => void = () => {};
  private fxPanelToggleButton: HTMLButtonElement | null = null;
  private isFxPanelVisible: boolean = true;
  private snapToggleButton: HTMLButtonElement | null = null;
  private playLayoutButton: HTMLButtonElement | null = null;
  private playLayoutInProgress: boolean = false;
  private readonly placementLights: Map<string, PointLight> = new Map();
  private visualPresetsReady: boolean = false;
  private visualPresetBindingsActive: boolean = false;
  private readonly defaultCameraAlpha: number = Math.PI * 1.25;
  private readonly defaultCameraBeta: number = Math.PI / 3.2;
  private freeRotateActive: boolean = false;
  private rotatePointerId: number | null = null;
  private lastRotatePosition: { x: number; y: number } | null = null;
  private activePointerButton: number | null = null;
  private lastDragPlacementKey: string | null = null;

  constructor(sceneManager: SceneManager) {
    this.sceneManager = sceneManager;
  }

  private snapToCellCenter(rawX: number, rawZ: number): {
    x: number;
    z: number;
    ix: number;
    iz: number;
  } {
    const ix = Math.floor(rawX / TILE_SIZE);
    const iz = Math.floor(rawZ / TILE_SIZE);
    const snappedX = ix * TILE_SIZE + TILE_SIZE / 2;
    const snappedZ = iz * TILE_SIZE + TILE_SIZE / 2;
    return { x: snappedX, z: snappedZ, ix, iz };
  }

  private getWallSnappedPosition(centerX: number, centerZ: number, rotationIndex: number): {
    x: number;
    z: number;
  } {
    const half = TILE_SIZE / 2;
    const normalizedIndex = ((rotationIndex % 4) + 4) % 4;

    switch (normalizedIndex) {
      case 0:
        return { x: centerX, z: centerZ + half };
      case 1:
        return { x: centerX + half, z: centerZ };
      case 2:
        return { x: centerX, z: centerZ - half };
      case 3:
        return { x: centerX - half, z: centerZ };
      default:
        return { x: centerX, z: centerZ };
    }
  }

  private getAlignedPositionForBrush(
    centerX: number,
    centerZ: number,
    rotationIndex: number,
    brush: BrushType
  ): { x: number; z: number } {
    if (brush === "wall") {
      return this.getWallSnappedPosition(centerX, centerZ, rotationIndex);
    }
    return { x: centerX, z: centerZ };
  }

  private cellKey(ix: number, iz: number, level: number): string {
    return `${ix},${iz},${level}`;
  }

  private registerTop(ix: number, iz: number, level: number, topY: number): void {
    const key = this.cellKey(ix, iz, level);
    const current = this.cellTopHeights.get(key);
    if (current === undefined || topY > current) {
      this.cellTopHeights.set(key, topY);
    }
  }

  private getRegisteredTop(ix: number, iz: number, level: number): number | null {
    const key = this.cellKey(ix, iz, level);
    return this.cellTopHeights.has(key) ? this.cellTopHeights.get(key)! : null;
  }

  private rebuildTopForCell(ix: number, iz: number, level: number): void {
    const key = this.cellKey(ix, iz, level);
    let maxTop = -Infinity;
    for (const entity of this.placedEntities) {
      if (entity.cellX === ix && entity.cellZ === iz && entity.level === level) {
        if (this.getBrushMetrics(entity.brushType).contributesTop && entity.topY > maxTop) {
          maxTop = entity.topY;
        }
      }
    }
    if (maxTop === -Infinity) {
      this.cellTopHeights.delete(key);
    } else {
      this.cellTopHeights.set(key, maxTop);
    }
  }

  private getCurrentElevationHeight(): number {
    return this.currentElevationIndex * LEVEL_HEIGHT;
  }

  private changeElevation(delta: number): void {
    const next = Math.max(0, this.currentElevationIndex + delta);
    if (next === this.currentElevationIndex) {
      return;
    }

    this.currentElevationIndex = next;
    this.updateElevationUI();
    this.refreshGhostElevation();
  }

  private updateElevationUI(): void {
    if (this.elevationLabel) {
      this.elevationLabel.textContent = `Level: ${this.currentElevationIndex}`;
    }
  }

  private refreshGhostElevation(): void {
    if (this.ghostSnapCenter) {
      this.ghostSnapCenter.y = this.getCurrentElevationHeight();
    }
    this.updatePendingPlacement();
  }

  async load(engine: Engine): Promise<void> {
    this.scene = new Scene(engine);
    this.scene.clearColor = new Color4(0.02, 0.02, 0.02, 1);

    const cameraTarget = new Vector3(0, 0, 0);
    this.cameraTarget = cameraTarget;
    const camera = new ArcRotateCamera(
      "EditorCamera",
      this.defaultCameraAlpha,
      this.defaultCameraBeta,
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
      this.contextMenuHandler = (event: MouseEvent) => {
        event.preventDefault();
      };
      canvas.addEventListener("contextmenu", this.contextMenuHandler);
      this.pointerLeaveHandler = () => {
        this.activePointerButton = null;
        this.lastDragPlacementKey = null;
        this.endFreeRotate();
        this.ghostSnapCenter = null;
        this.ghostCell = null;
        this.clearPendingPlacement();
      };
      canvas.addEventListener("pointerleave", this.pointerLeaveHandler);
      camera.attachControl(canvas, true);
    } else {
      console.warn("[EditorScene] rendering canvas missing during load");
    }

    this.camera = camera;
    this.scene.activeCamera = camera;

    try {
      HudUI.init();
      HudUI.setGameplayHudVisible(false);
      HudUI.setVisualControlPanelVisible(true);
      this.isFxPanelVisible = true;
    } catch (error) {
      console.warn("[EditorScene] Failed to configure HUD for editor", error);
    }

    await this.initializeVisualPresets();

    this.createLighting();
    this.createGrid();
    this.buildPaletteUI();
    this.buildFxPanelToggle();
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
    this.placedEntities.length = 0;
    this.cellTopHeights.clear();
    this.brushMaterials.clear();
    this.placementCounter = 0;

    // Clean up all placement lights
    for (const [placementId, light] of this.placementLights) {
      try {
        light.dispose();
      } catch (error) {
        console.warn(`[EditorScene] Failed to dispose light ${placementId}`, error);
      }
    }
    this.placementLights.clear();

    this.disposePaletteUI();
    this.disposeFxPanelToggle();

    try {
      HudUI.setGameplayHudVisible(true);
      HudUI.setVisualControlPanelVisible(true);
    } catch (error) {
      console.warn("[EditorScene] Failed to restore HUD after editor", error);
    }
    this.isFxPanelVisible = true;

    if (this.canvas && this.contextMenuHandler) {
      this.canvas.removeEventListener("contextmenu", this.contextMenuHandler);
    }
    if (this.canvas && this.pointerLeaveHandler) {
      this.canvas.removeEventListener("pointerleave", this.pointerLeaveHandler);
    }
    this.canvas = null;
    this.contextMenuHandler = null;
    this.pointerLeaveHandler = null;
    this.freeRotateActive = false;
    this.rotatePointerId = null;
    this.lastRotatePosition = null;
    this.activePointerButton = null;
    this.lastDragPlacementKey = null;

    this.grid = null;
    this.camera = null;
    this.cameraTarget = Vector3.Zero();
    this.pressedKeys.clear();
    this.zoomInHeld = false;
    this.zoomOutHeld = false;
    this.wheelZoomDelta = 0;
    this.ghostPosition = null;
    this.ghostSnapCenter = null;
    this.ghostCell = null;
    this.pendingPlacement = null;
    this.pendingPlacementResult = null;
    this.ghostRotationIndex = 0;
    this.currentElevationIndex = 0;
    this.snapToTopEnabled = true;

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

  private async initializeVisualPresets(): Promise<void> {
    if (!this.scene) {
      return;
    }

    try {
      await VisualPresetManager.initialize();
      this.visualPresetsReady = true;
    } catch (error) {
      this.visualPresetsReady = false;
      console.warn("[EditorScene] Failed to initialize visual presets", error);
      return;
    }

    this.setupVisualPresetBindings();
    this.applyCurrentVisualPreset();
  }

  private setupVisualPresetBindings(): void {
    if (!this.visualPresetsReady || this.visualPresetBindingsActive) {
      return;
    }

    try {
      HudUI.setVisualControls(VisualPresetManager.getVisualControlDefinitions());
      HudUI.onClickVisualPreset(() => {
        this.cycleVisualPreset("HUD");
      });
      HudUI.onFxIntensityChanged((value) => {
        this.handleFxIntensityChange(value);
      });
      HudUI.onVisualControlChanged((id, value) => {
        this.handleVisualControlChange(id, value);
      });
      this.visualPresetBindingsActive = true;
      this.syncVisualControlValues();
    } catch (error) {
      console.warn("[EditorScene] Failed to bind visual preset controls", error);
    }
  }

  private applyCurrentVisualPreset(): void {
    if (!this.visualPresetsReady || !this.scene) {
      return;
    }

    try {
      VisualPresetManager.applyActivePreset();
      const pipeline = PostFXConfig.apply(this.scene);
      if (!pipeline) {
        console.warn("[EditorScene] PostFX pipeline was not applied (no active camera).");
      }
      const intensity = VisualPresetManager.getEffectIntensity();
      EffectsFactory.setGlobalIntensity(intensity);
      HudUI.setVisualPresetLabel(VisualPresetManager.getActivePresetName());
      HudUI.setFxIntensity(intensity);
      this.syncVisualControlValues();
    } catch (error) {
      console.warn("[EditorScene] Failed to apply visual preset", error);
    }
  }

  private cycleVisualPreset(source: string): void {
    if (!this.visualPresetsReady) {
      return;
    }

    try {
      const name = VisualPresetManager.cyclePreset();
      console.log(`[QA] EditorScene switched visual preset to ${name} via ${source}`);
      this.applyCurrentVisualPreset();
    } catch (error) {
      console.warn(`[EditorScene] Failed to cycle visual preset from ${source}`, error);
    }
  }

  private handleFxIntensityChange(value: number): void {
    if (!this.visualPresetsReady || !Number.isFinite(value)) {
      return;
    }

    const clamped = Math.max(0, Math.min(1, value));
    try {
      VisualPresetManager.setEffectIntensity(clamped);
      HudUI.setFxIntensity(clamped);
      this.applyCurrentVisualPreset();
    } catch (error) {
      console.warn("[EditorScene] Failed to update FX intensity", error);
    }
  }

  private handleVisualControlChange(id: VisualControlId, value: number): void {
    if (!this.visualPresetsReady || !Number.isFinite(value)) {
      return;
    }

    if (id === "effects.intensity") {
      // Routed through handleFxIntensityChange.
      return;
    }

    try {
      const applied = VisualPresetManager.setControlValue(id, value);
      if (!applied) {
        console.warn("[EditorScene] Unknown visual control id", id, value);
        return;
      }
      this.applyCurrentVisualPreset();
    } catch (error) {
      console.warn("[EditorScene] Failed to update visual control", id, value, error);
    }
  }

  private syncVisualControlValues(): void {
    if (!this.visualPresetsReady) {
      return;
    }

    try {
      const definitions = VisualPresetManager.getVisualControlDefinitions();
      for (const definition of definitions) {
        const current = VisualPresetManager.getControlValue(definition.id);
        if (current !== undefined) {
          HudUI.updateVisualControlValue(definition.id, current);
        }
      }
    } catch (error) {
      console.warn("[EditorScene] Failed to sync visual control values", error);
    }
  }

  private createGrid(): void {
    if (!this.scene) {
      return;
    }

    const gridExtentTiles = 40;
    const halfExtent = gridExtentTiles * TILE_SIZE;

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
      const offset = i * TILE_SIZE;
      lines.push([
        new Vector3(offset, 0, -halfExtent),
        new Vector3(offset, 0, halfExtent),
      ]);
    }

    for (let j = -gridExtentTiles; j <= gridExtentTiles; j++) {
      const offset = j * TILE_SIZE;
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

    const elevationControls = document.createElement("div");
    Object.assign(elevationControls.style, {
      display: "flex",
      alignItems: "center",
      gap: "6px",
      marginTop: "4px",
    });

    const decreaseButton = document.createElement("button");
    decreaseButton.type = "button";
    decreaseButton.textContent = "-";
    Object.assign(decreaseButton.style, {
      width: "28px",
      height: "28px",
      borderRadius: "4px",
      border: "1px solid rgba(210, 180, 110, 0.3)",
      background: "rgba(50, 50, 56, 0.8)",
      color: "#f5e6d6",
      cursor: "pointer",
      fontSize: "16px",
      lineHeight: "1",
    });
    decreaseButton.addEventListener("click", (event) => {
      event.preventDefault();
      this.changeElevation(-1);
    });

    const elevationLabel = document.createElement("div");
    elevationLabel.style.minWidth = "72px";
    elevationLabel.style.textAlign = "center";
    elevationLabel.style.fontWeight = "bold";
    elevationControls.appendChild(decreaseButton);
    elevationControls.appendChild(elevationLabel);
    this.elevationLabel = elevationLabel;

    const increaseButton = document.createElement("button");
    increaseButton.type = "button";
    increaseButton.textContent = "+";
    Object.assign(increaseButton.style, {
      width: "28px",
      height: "28px",
      borderRadius: "4px",
      border: "1px solid rgba(210, 180, 110, 0.3)",
      background: "rgba(50, 50, 56, 0.8)",
      color: "#f5e6d6",
      cursor: "pointer",
      fontSize: "16px",
      lineHeight: "1",
    });
    increaseButton.addEventListener("click", (event) => {
      event.preventDefault();
      this.changeElevation(1);
    });
    elevationControls.appendChild(increaseButton);

    root.appendChild(elevationControls);

    const snapRow = document.createElement("div");
    Object.assign(snapRow.style, {
      display: "flex",
      alignItems: "center",
      gap: "8px",
    });
    const snapLabel = document.createElement("span");
    snapLabel.textContent = "Snap to Top";
    snapLabel.style.fontWeight = "bold";
    const snapButton = document.createElement("button");
    snapButton.type = "button";
    Object.assign(snapButton.style, {
      flexGrow: "1",
      padding: "6px 8px",
      background: "rgba(50, 50, 56, 0.8)",
      color: "#f5e6d6",
      border: "1px solid rgba(210, 180, 110, 0.3)",
      borderRadius: "4px",
      cursor: "pointer",
    });
    snapButton.addEventListener("click", (event) => {
      event.preventDefault();
      this.toggleSnapToTop();
    });
    snapRow.appendChild(snapLabel);
    snapRow.appendChild(snapButton);
    root.appendChild(snapRow);
    this.snapToggleButton = snapButton;
    this.updateSnapToggleLabel();

    const levelNote = document.createElement("div");
    levelNote.textContent = "Level controls base of placement. Ramps go L -> L+1.";
    levelNote.style.fontSize = "12px";
    levelNote.style.opacity = "0.8";
    levelNote.style.marginTop = "4px";
    root.appendChild(levelNote);

    const ghostLabel = document.createElement("div");
    ghostLabel.style.marginTop = "6px";
    ghostLabel.style.fontSize = "12px";
    ghostLabel.style.opacity = "0.85";
    ghostLabel.textContent = "L-- yBase=-- top=--";
    root.appendChild(ghostLabel);
    this.ghostDebugLabel = ghostLabel;
    this.updateGhostDebugLabel(this.pendingPlacement, this.pendingPlacementResult);

    const exportSection = document.createElement("div");
    Object.assign(exportSection.style, {
      marginTop: "10px",
      paddingTop: "10px",
      borderTop: "1px solid rgba(210, 180, 110, 0.2)",
      display: "flex",
      flexDirection: "column",
      gap: "6px",
    });

    const exportHeader = document.createElement("div");
    exportHeader.textContent = "Layout Export";
    exportHeader.style.fontWeight = "bold";
    exportSection.appendChild(exportHeader);

    const saveButton = document.createElement("button");
    saveButton.type = "button";
    saveButton.textContent = "Save Layout";
    Object.assign(saveButton.style, {
      padding: "8px 10px",
      background: "rgba(80, 84, 96, 0.9)",
      color: "#f5e6d6",
      border: "1px solid rgba(210, 180, 110, 0.4)",
      borderRadius: "4px",
      cursor: "pointer",
      fontWeight: "bold",
    });
    saveButton.addEventListener("click", (event) => {
      event.preventDefault();
      this.handleSaveLayout();
    });
    exportSection.appendChild(saveButton);

    const playButton = document.createElement("button");
    playButton.type = "button";
    playButton.textContent = "Play This Layout";
    Object.assign(playButton.style, {
      padding: "8px 10px",
      background: "rgba(110, 120, 156, 0.92)",
      color: "#f5f7ff",
      border: "1px solid rgba(180, 200, 255, 0.45)",
      borderRadius: "4px",
      cursor: "pointer",
      fontWeight: "bold",
    });
    playButton.addEventListener("click", (event) => {
      event.preventDefault();
      void this.handlePlayLayout();
    });
    exportSection.appendChild(playButton);
    this.playLayoutButton = playButton;

    const exportHint = document.createElement("div");
    exportHint.textContent = "Logs JSON and downloads a .json file.";
    exportHint.style.fontSize = "12px";
    exportHint.style.opacity = "0.75";
    exportSection.appendChild(exportHint);

    root.appendChild(exportSection);

    document.body.appendChild(root);
    this.paletteRoot = root;
    this.updateElevationUI();
    this.updatePlayLayoutButtonState();
  }

  private buildFxPanelToggle(): void {
    if (typeof document === "undefined") {
      return;
    }

    this.disposeFxPanelToggle();

    const button = document.createElement("button");
    button.type = "button";
    Object.assign(button.style, {
      position: "absolute",
      top: "18px",
      right: "296px",
      padding: "6px 10px",
      background: "rgba(38, 44, 58, 0.85)",
      border: "1px solid rgba(210, 220, 255, 0.35)",
      borderRadius: "4px",
      color: "#f2f4ff",
      fontSize: "12px",
      cursor: "pointer",
      zIndex: "20",
      pointerEvents: "auto",
    });
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.toggleFxPanel();
    });

    document.body.appendChild(button);
    this.fxPanelToggleButton = button;
    this.updateFxPanelToggleLabel();
  }

  private updateFxPanelToggleLabel(): void {
    if (this.fxPanelToggleButton) {
      this.fxPanelToggleButton.textContent = this.isFxPanelVisible
        ? "FX Panel [Hide]"
        : "FX Panel [Show]";
    }
  }

  private toggleFxPanel(): void {
    this.isFxPanelVisible = !this.isFxPanelVisible;
    try {
      HudUI.setVisualControlPanelVisible(this.isFxPanelVisible);
    } catch (error) {
      console.warn("[EditorScene] Failed to toggle visual controls panel", error);
    }
    this.updateFxPanelToggleLabel();
  }

  private disposeFxPanelToggle(): void {
    if (this.fxPanelToggleButton?.parentElement) {
      this.fxPanelToggleButton.parentElement.removeChild(this.fxPanelToggleButton);
    }
    this.fxPanelToggleButton = null;
  }

  private disposePaletteUI(): void {
    this.paletteButtons.clear();
    if (this.paletteRoot?.parentElement) {
      this.paletteRoot.parentElement.removeChild(this.paletteRoot);
    }
    this.paletteRoot = null;
    this.currentBrushLabel = null;
    this.elevationLabel = null;
    this.ghostDebugLabel = null;
    this.snapToggleButton = null;
    this.playLayoutButton = null;
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

    this.updatePendingPlacement();
  }

  private registerEventListeners(): void {
    this.keyDownHandler = (event: KeyboardEvent) => {
      if (this.handleZoomKeys(event, true)) {
        event.preventDefault();
        return;
      }

      if (this.handleEditorShortcuts(event)) {
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
        const event = pointerInfo.event as PointerEvent;
        switch (pointerInfo.type) {
          case PointerEventTypes.POINTERDOWN: {
            if (this.tryBeginFreeRotate(event)) {
              event.preventDefault();
              return;
            }
            if (event.button === 0) {
              this.activePointerButton = 0;
              this.updatePendingPlacement();
              this.handlePlacement();
              const context = this.pendingPlacement;
              if (context) {
                this.lastDragPlacementKey = this.cellKey(context.ix, context.iz, context.level);
              }
              event.preventDefault();
            } else if (event.button === 2) {
              this.handleDeletion(pointerInfo.pickInfo ?? null);
              event.preventDefault();
            }
            break;
          }
          case PointerEventTypes.POINTERMOVE: {
            if (this.freeRotateActive && event.pointerId === this.rotatePointerId) {
              this.updateFreeRotate(event);
              event.preventDefault();
              return;
            }
            if (this.activePointerButton === 0) {
              this.updatePendingPlacement();
              const context = this.pendingPlacement;
              if (context) {
                const dragKey = this.cellKey(context.ix, context.iz, context.level);
                if (dragKey !== this.lastDragPlacementKey) {
                  this.handlePlacement();
                  this.lastDragPlacementKey = dragKey;
                }
              }
            }
            break;
          }
          case PointerEventTypes.POINTERUP: {
            if (event.pointerId === this.rotatePointerId || event.button === 1) {
              this.endFreeRotate();
            }
            if (event.button === 0) {
              this.activePointerButton = null;
              this.lastDragPlacementKey = null;
            }
            if (event.button === 0 || event.button === 1) {
              event.preventDefault();
            }
            break;
          }
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

    if (event.code === "Space" && !event.repeat) {
      this.snapCameraToDefault();
      return true;
    }

    return false;
  }

  private rotateGhost(): void {
    this.ghostRotationIndex = (this.ghostRotationIndex + 1) % 4;
    if (this.ghostSnapCenter) {
      this.ghostSnapCenter.y = this.getCurrentElevationHeight();
    }
    this.updatePendingPlacement();
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

    if (this.freeRotateActive) {
      this.ghostSnapCenter = null;
      this.ghostCell = null;
      this.clearPendingPlacement();
      return;
    }

    if (this.scene.pointerX < 0 || this.scene.pointerY < 0) {
      this.ghostSnapCenter = null;
      this.ghostCell = null;
      this.clearPendingPlacement();
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
        this.ghostSnapCenter = null;
        this.ghostCell = null;
        this.clearPendingPlacement();
        return;
      }
      const distance = ray.intersectsPlane(this.groundPlane);
      if (distance === null) {
        this.ghostSnapCenter = null;
        this.ghostCell = null;
        this.clearPendingPlacement();
        return;
      }

      const intersectionPoint = ray.origin.add(ray.direction.scale(distance));
      const snapped = this.snapToCellCenter(intersectionPoint.x, intersectionPoint.z);
      const height = this.getCurrentElevationHeight();
      this.ghostSnapCenter = new Vector3(snapped.x, height, snapped.z);
      this.ghostCell = { ix: snapped.ix, iz: snapped.iz };
      this.updatePendingPlacement();
    } catch (error) {
      console.warn("[EditorScene] Failed to update ghost position", error);
      this.ghostSnapCenter = null;
      this.ghostCell = null;
      this.clearPendingPlacement();
    }
  }

  private updateGhostVisuals(): void {
    if (!this.ghostMesh || !this.scene) {
      return;
    }

    if (!this.pendingPlacement || !this.pendingPlacementResult) {
      this.updateGhostVisibility(false);
      return;
    }

    this.applyBrushTransform(this.ghostMesh, this.pendingPlacement, this.pendingPlacementResult);
    this.updateGhostVisibility(true);
  }

  private updateGhostVisibility(visible: boolean): void {
    if (!this.ghostMesh) {
      return;
    }
    this.ghostMesh.setEnabled(visible);
    this.ghostMesh.isVisible = visible;
  }

  private getBrushMetrics(brush: BrushType): BrushMetrics {
    switch (brush) {
      case "floor":
        return {
          halfHeight: TILE_THICKNESS / 2,
          supportsSnap: false,
          contributesTop: true,
          stackOffset: 0,
        };
      case "wall":
        return {
          halfHeight: WALL_HEIGHT / 2,
          supportsSnap: true,
          contributesTop: false,
          stackOffset: EPS,
        };
      case "ramp":
        return {
          halfHeight: LEVEL_HEIGHT / 2,
          supportsSnap: true,
          contributesTop: false,
          stackOffset: 0,
        };
      case "pillar":
        return {
          halfHeight: PILLAR_HEIGHT / 2,
          supportsSnap: true,
          contributesTop: false,
          stackOffset: EPS,
        };
      case "prop_crate":
        return {
          halfHeight: PROP_CRATE_HEIGHT / 2,
          supportsSnap: true,
          contributesTop: false,
          stackOffset: EPS,
        };
      case "prop_bones":
        return {
          halfHeight: PROP_BONES_HEIGHT / 2,
          supportsSnap: true,
          contributesTop: false,
          stackOffset: EPS,
        };
      case "enemy_spawn":
      case "player_spawn":
        return {
          halfHeight: SPAWN_HEIGHT / 2,
          supportsSnap: true,
          contributesTop: false,
          stackOffset: EPS,
        };
      case "light_torch":
        return {
          halfHeight: LIGHT_TORCH_MARKER_HEIGHT / 2,
          supportsSnap: true,
          contributesTop: false,
          stackOffset: EPS,
        };
      case "light_fill":
        return {
          halfHeight: LIGHT_FILL_MARKER_HEIGHT / 2,
          supportsSnap: true,
          contributesTop: false,
          stackOffset: EPS,
        };
      default:
        return {
          halfHeight: TILE_THICKNESS / 2,
          supportsSnap: false,
          contributesTop: false,
          stackOffset: 0,
        };
    }
  }

  private computePlacement(context: PlacementContext): PlacementResult {
    const { brushType, ix, iz, level, centerX, centerZ, rotationIndex, useSnap } = context;
    const aligned = this.getAlignedPositionForBrush(centerX, centerZ, rotationIndex, brushType);
    const metrics = this.getBrushMetrics(brushType);
    const baseY = level * LEVEL_HEIGHT;
    let centerY = baseY + metrics.halfHeight;
    if (brushType === "ramp") {
      centerY = baseY + TILE_THICKNESS + metrics.halfHeight;
    }
    let supportTop: number | null = null;

    if (metrics.supportsSnap && useSnap) {
      const top = this.getRegisteredTop(ix, iz, level);
      if (top !== null) {
        supportTop = top;
        centerY = top + metrics.halfHeight + metrics.stackOffset;
      }
    }

    const position = new Vector3(aligned.x, centerY, aligned.z);
    const topY = centerY + metrics.halfHeight;

    return {
      position,
      topY,
      baseY,
      supportTop,
      metrics,
    };
  }

  private buildPlacementContext(): PlacementContext | null {
    if (!this.ghostSnapCenter || !this.ghostCell) {
      return null;
    }
    return {
      brushType: this.currentBrushType,
      ix: this.ghostCell.ix,
      iz: this.ghostCell.iz,
      level: this.currentElevationIndex,
      centerX: this.ghostSnapCenter.x,
      centerZ: this.ghostSnapCenter.z,
      rotationIndex: this.ghostRotationIndex,
      useSnap: this.snapToTopEnabled,
    };
  }

  private clearPendingPlacement(): void {
    this.pendingPlacement = null;
    this.pendingPlacementResult = null;
    this.ghostPosition = null;
    this.lastDragPlacementKey = null;
    this.updateGhostVisibility(false);
    this.updateGhostDebugLabel(null, null);
  }

  private updatePendingPlacement(): void {
    const context = this.buildPlacementContext();
    if (!context) {
      this.clearPendingPlacement();
      return;
    }

    const placement = this.computePlacement(context);
    this.pendingPlacement = context;
    this.pendingPlacementResult = placement;
    this.ghostPosition = placement.position.clone();

    if (this.ghostMesh) {
      this.applyBrushTransform(this.ghostMesh, context, placement);
      this.updateGhostVisibility(true);
    }
    this.updateGhostDebugLabel(context, placement);
    this.updatePlayLayoutButtonState();
  }

  private updateGhostDebugLabel(
    context: PlacementContext | null,
    placement: PlacementResult | null
  ): void {
    if (!this.ghostDebugLabel) {
      return;
    }
    if (!context || !placement) {
      this.ghostDebugLabel.textContent = "L-- yBase=-- top=--";
      return;
    }
    const baseY = context.level * LEVEL_HEIGHT;
    this.ghostDebugLabel.textContent = `L${context.level} yBase=${baseY.toFixed(
      2
    )} top=${placement.topY.toFixed(2)}`;
  }

  private updateSnapToggleLabel(): void {
    if (!this.snapToggleButton) {
      return;
    }
    this.snapToggleButton.textContent = this.snapToTopEnabled ? "Snap To Top: ON" : "Snap To Top: OFF";
  }

  private toggleSnapToTop(): void {
    this.snapToTopEnabled = !this.snapToTopEnabled;
    this.updateSnapToggleLabel();
    this.updatePendingPlacement();
  }

  private tryBeginFreeRotate(event: PointerEvent): boolean {
    if (!this.camera) {
      return false;
    }
    const wantsRotate = event.button === 1 || (event.button === 0 && event.altKey);
    if (!wantsRotate) {
      return false;
    }
    this.freeRotateActive = true;
    this.rotatePointerId = event.pointerId;
    this.lastRotatePosition = { x: event.clientX, y: event.clientY };
    this.activePointerButton = null;
    this.lastDragPlacementKey = null;
    if (this.canvas) {
      try {
        this.canvas.setPointerCapture(event.pointerId);
      } catch {
        // ignore capture failures (e.g., synthetic events)
      }
    }
    return true;
  }

  private updateFreeRotate(event: PointerEvent): void {
    if (!this.freeRotateActive || !this.camera || !this.lastRotatePosition) {
      return;
    }
    const deltaX = event.clientX - this.lastRotatePosition.x;
    const deltaY = event.clientY - this.lastRotatePosition.y;
    const rotateSpeed = 0.003;
    this.camera.alpha -= deltaX * rotateSpeed;
    this.camera.beta = Scalar.Clamp(
      this.camera.beta - deltaY * rotateSpeed,
      0.2,
      Math.PI / 2 - 0.1
    );
    this.lastRotatePosition = { x: event.clientX, y: event.clientY };
  }

  private endFreeRotate(): void {
    if (!this.freeRotateActive) {
      return;
    }
    if (this.canvas && this.rotatePointerId !== null) {
      try {
        this.canvas.releasePointerCapture(this.rotatePointerId);
      } catch {
        // ignore release failures
      }
    }
    this.freeRotateActive = false;
    this.rotatePointerId = null;
    this.lastRotatePosition = null;
  }

  private snapCameraToDefault(): void {
    if (!this.camera) {
      return;
    }
    this.camera.alpha = this.defaultCameraAlpha;
    this.camera.beta = this.defaultCameraBeta;
    this.camera.setTarget(this.cameraTarget);
  }

  private createBrushMesh(name: string, brushType: BrushType): Mesh {
    if (!this.scene) {
      throw new Error("EditorScene has no active scene for mesh creation");
    }

    let mesh: Mesh;
    const baseRotation = new Vector3(0, 0, 0);

    switch (brushType) {
      case "floor": {
        mesh = MeshBuilder.CreateBox(
          name,
          { width: TILE_SIZE, height: TILE_THICKNESS, depth: TILE_SIZE },
          this.scene
        );
        break;
      }
      case "wall": {
        const wallThickness = TILE_SIZE * WALL_THICKNESS_RATIO;
        mesh = MeshBuilder.CreateBox(
          name,
          { width: TILE_SIZE + wallThickness, height: WALL_HEIGHT, depth: wallThickness },
          this.scene
        );
        break;
      }
      case "ramp": {
        const ramp = new Mesh(name, this.scene);
        const halfWidth = TILE_SIZE / 2;
        const halfDepth = TILE_SIZE / 2;
        const lowY = -LEVEL_HEIGHT / 2;
        const highY = LEVEL_HEIGHT / 2;
        const positions = [
          -halfWidth, lowY, -halfDepth,
          halfWidth, lowY, -halfDepth,
          halfWidth, lowY, halfDepth,
          -halfWidth, lowY, halfDepth,
          -halfWidth, highY, halfDepth,
          halfWidth, highY, halfDepth,
        ];
        const indices = [
          0, 1, 2,
          0, 2, 3,
          0, 1, 5,
          0, 5, 4,
          0, 3, 4,
          1, 5, 2,
          3, 2, 5,
          3, 5, 4,
        ];
        const uvs = [
          0, 0,
          1, 0,
          1, 1,
          0, 1,
          0, 1,
          1, 1,
        ];
        const vertexData = new VertexData();
        const normals: number[] = [];
        VertexData.ComputeNormals(positions, indices, normals);
        vertexData.positions = positions;
        vertexData.indices = indices;
        vertexData.uvs = uvs;
        vertexData.normals = normals;
        vertexData.applyToMesh(ramp);
        mesh = ramp;
        break;
      }
      case "pillar": {
        mesh = MeshBuilder.CreateCylinder(
          name,
          { height: PILLAR_HEIGHT, diameter: TILE_SIZE * 0.45 },
          this.scene
        );
        break;
      }
      case "prop_crate": {
        mesh = MeshBuilder.CreateBox(
          name,
          { width: PROP_CRATE_SIZE, height: PROP_CRATE_HEIGHT, depth: PROP_CRATE_SIZE },
          this.scene
        );
        break;
      }
      case "prop_bones": {
        mesh = MeshBuilder.CreateCylinder(
          name,
          { height: PROP_BONES_HEIGHT, diameter: TILE_SIZE * 0.6 },
          this.scene
        );
        break;
      }
      case "enemy_spawn": {
        mesh = MeshBuilder.CreateCylinder(
          name,
          { height: SPAWN_HEIGHT, diameter: TILE_SIZE * 0.7 },
          this.scene
        );
        break;
      }
      case "player_spawn": {
        mesh = MeshBuilder.CreateCylinder(
          name,
          { height: SPAWN_HEIGHT, diameter: TILE_SIZE * 0.7 },
          this.scene
        );
        break;
      }
      case "light_torch": {
        mesh = MeshBuilder.CreateCylinder(
          name,
          { height: LIGHT_TORCH_MARKER_HEIGHT, diameter: LIGHT_TORCH_MARKER_DIAMETER },
          this.scene
        );
        break;
      }
      case "light_fill": {
        mesh = MeshBuilder.CreateCylinder(
          name,
          { height: LIGHT_FILL_MARKER_HEIGHT, diameter: LIGHT_FILL_MARKER_DIAMETER },
          this.scene
        );
        break;
      }
      default:
        throw new Error(`Unsupported brush type: ${brushType}`);
    }

    const metrics = this.getBrushMetrics(brushType);

    const metadata: EditorMeshMetadata = {
      editorBrushType: brushType,
      baseRotation: baseRotation.clone(),
      halfHeight: metrics.halfHeight,
      originOffset: 0,
      supportsSnap: metrics.supportsSnap,
      stackOffset: metrics.stackOffset,
      contributesTop: metrics.contributesTop,
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
      case "light_torch":
        return new Color3(0.95, 0.58, 0.32);
      case "light_fill":
        return new Color3(0.52, 0.68, 0.95);
      default:
        return new Color3(0.6, 0.6, 0.6);
    }
  }

  private applyBrushTransform(
    mesh: Mesh,
    context: PlacementContext,
    placement: PlacementResult
  ): void {
    const metadata = this.getMeshMetadata(mesh);
    mesh.position.copyFrom(placement.position);

    const baseRotation = metadata?.baseRotation ?? Vector3.Zero();
    mesh.rotation.x = baseRotation.x;
    mesh.rotation.y = baseRotation.y + context.rotationIndex * (Math.PI / 2);
    mesh.rotation.z = baseRotation.z;

    if (metadata) {
      metadata.rotationIndex = context.rotationIndex;
      metadata.level = context.level;
      metadata.cellX = context.ix;
      metadata.cellZ = context.iz;
      metadata.topY = placement.topY;
    }
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

  private buildLayoutSnapshot(): PlacedEntity[] {
    return this.placedEntities.map((record) => this.convertPlacementRecord(record));
  }

  private convertPlacementRecord(record: EditorPlacementRecord): PlacedEntity {
    const rotationIndex = this.normalizeRotationIndex(record.rotationIndex);
    const layout: PlacedEntity = {
      type: record.brushType,
      pos: {
        x: this.roundCoordinate(record.pos.x),
        y: this.roundCoordinate(record.pos.y),
        z: this.roundCoordinate(record.pos.z),
      },
      rotY: rotationIndex * 90,
      scale: 1,
    };

    const params = record.params ?? this.getDefaultLightParams(record.brushType);
    if (params) {
      layout.params = this.cloneLightParams(params);
    }

    return layout;
  }

  private normalizeRotationIndex(index: number): number {
    return ((index % 4) + 4) % 4;
  }

  private roundCoordinate(value: number): number {
    const rounded = Math.round(value * 1000) / 1000;
    return Math.abs(rounded) < 1e-6 ? 0 : rounded;
  }

  private cloneLightParams(params: LightParams | null | undefined): LightParams | undefined {
    if (!params) {
      return undefined;
    }
    return {
      color: [...params.color] as [number, number, number],
      intensity: params.intensity,
      range: params.range,
    };
  }

  private getDefaultLightParams(brush: BrushType): LightParams | null {
    if (brush === "light_torch") {
      return {
        color: [...DEFAULT_TORCH_LIGHT.color] as [number, number, number],
        intensity: DEFAULT_TORCH_LIGHT.intensity,
        range: DEFAULT_TORCH_LIGHT.range,
      };
    }
    if (brush === "light_fill") {
      return {
        color: [...DEFAULT_FILL_LIGHT.color] as [number, number, number],
        intensity: DEFAULT_FILL_LIGHT.intensity,
        range: DEFAULT_FILL_LIGHT.range,
      };
    }
    return null;
  }

  private createPlacementLight(
    placementId: string,
    brushType: BrushType,
    position: Vector3,
    params?: LightParams
  ): void {
    if (!this.scene) {
      return;
    }

    const lightParams = params || this.getDefaultLightParams(brushType);
    if (!lightParams) {
      console.warn(`[EditorScene] No light params for brush type: ${brushType}`);
      return;
    }

    try {
      const light = new PointLight(
        `EditorLight_${placementId}`,
        position.clone(),
        this.scene
      );

      light.diffuse = new Color3(lightParams.color[0], lightParams.color[1], lightParams.color[2]);
      light.intensity = lightParams.intensity;
      light.range = lightParams.range;

      // Adjust light position based on brush type
      if (brushType === "light_torch") {
        light.position.y += LIGHT_TORCH_LIGHT_OFFSET_Y;
      } else if (brushType === "light_fill") {
        light.position.y += LIGHT_FILL_LIGHT_HEIGHT;
      }

      this.placementLights.set(placementId, light);
      console.log(`[EditorScene] Created ${brushType} light at`, light.position.toString());
    } catch (error) {
      console.warn(`[EditorScene] Failed to create light for ${brushType}`, error);
    }
  }

  private removePlacementLight(placementId: string): void {
    const light = this.placementLights.get(placementId);
    if (light) {
      try {
        light.dispose();
        this.placementLights.delete(placementId);
        console.log(`[EditorScene] Removed light for placement ${placementId}`);
      } catch (error) {
        console.warn(`[EditorScene] Failed to dispose light for placement ${placementId}`, error);
      }
    }
  }

  private buildLayoutFilename(): string {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    return `dungeon-layout-${timestamp}.json`;
  }

  private triggerLayoutDownload(json: string): void {
    if (typeof document === "undefined" || typeof URL === "undefined") {
      console.warn("[EditorScene] Document or URL unavailable; skipping layout download");
      return;
    }

    try {
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = this.buildLayoutFilename();
      anchor.style.display = "none";
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      setTimeout(() => {
        try {
          URL.revokeObjectURL(url);
        } catch (revokeError) {
          console.warn("[EditorScene] Failed to revoke layout download URL", revokeError);
        }
      }, 0);
    } catch (error) {
      console.warn("[EditorScene] Failed to trigger layout download", error);
    }
  }

  private handleSaveLayout(): void {
    try {
      const layout = this.buildLayoutSnapshot();
      const json = JSON.stringify(layout, null, 2);
      console.log("[EditorScene] Layout export (entities):", layout);
      console.log("[EditorScene] Layout export JSON:\n" + json);
      if (layout.length === 0) {
        console.info("[EditorScene] Layout export produced an empty layout.");
      }
      this.triggerLayoutDownload(json);
    } catch (error) {
      console.warn("[EditorScene] Failed to export layout", error);
    }
  }

  private handlePlacement(): void {
    if (!this.scene) {
      return;
    }

    const context = this.pendingPlacement ?? this.buildPlacementContext();
    if (!context) {
      return;
    }
    let placement = this.pendingPlacementResult;
    if (!placement || this.pendingPlacement !== context) {
      placement = this.computePlacement(context);
    }
    if (!this.pendingPlacement) {
      this.pendingPlacement = context;
      this.pendingPlacementResult = placement;
    }
    this.pendingPlacementResult = placement;
    if (!placement) {
      return;
    }

    try {
      const name = `EditorPlaced_${context.brushType}_${this.placementCounter++}`;
      const mesh = this.createBrushMesh(name, context.brushType);
      mesh.isPickable = true;
      mesh.material = this.getOrCreateBrushMaterial(context.brushType);
      this.applyBrushTransform(mesh, context, placement);

      const metadata = this.getMeshMetadata(mesh);
      if (metadata) {
        metadata.placementId = name;
      }

      this.placedMeshes.push(mesh);
      this.undoStack.push(mesh);

      const record: EditorPlacementRecord = {
        id: name,
        brushType: context.brushType,
        pos: { x: mesh.position.x, y: mesh.position.y, z: mesh.position.z },
        rotationIndex: context.rotationIndex,
        level: context.level,
        cellX: context.ix,
        cellZ: context.iz,
        topY: placement.topY,
      };
      const defaultParams = this.getDefaultLightParams(context.brushType);
      if (defaultParams) {
        record.params = this.cloneLightParams(defaultParams);
      }
      this.placedEntities.push(record);

      // Create PointLight for light brushes
      if (context.brushType === "light_torch" || context.brushType === "light_fill") {
        this.createPlacementLight(name, context.brushType, placement.position, record.params);
      }

      if (placement.metrics.contributesTop) {
        this.registerTop(context.ix, context.iz, context.level, placement.topY);
      }
    } catch (error) {
      console.warn(`[EditorScene] Failed to place ${context.brushType}`, error);
    } finally {
      this.updatePendingPlacement();
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
    const metadata = this.getMeshMetadata(mesh);
    if (metadata?.placementId) {
      // Clean up associated light if it exists
      this.removePlacementLight(metadata.placementId);
      this.removePlacedEntity(metadata.placementId);
    } else if (
      metadata &&
      metadata.level !== undefined &&
      metadata.cellX !== undefined &&
      metadata.cellZ !== undefined
    ) {
      this.rebuildTopForCell(metadata.cellX, metadata.cellZ, metadata.level);
    }

    if (!mesh.isDisposed()) {
      mesh.dispose();
    }

    this.updatePendingPlacement();
    this.updatePlayLayoutButtonState();
  }

  private removePlacedEntity(placementId: string): EditorPlacementRecord | null {
    const entityIndex = this.placedEntities.findIndex((entity) => entity.id === placementId);
    if (entityIndex === -1) {
      return null;
    }

    const [entity] = this.placedEntities.splice(entityIndex, 1);
    this.rebuildTopForCell(entity.cellX, entity.cellZ, entity.level);
    this.updatePlayLayoutButtonState();
    return entity;
  }

  private updatePlayLayoutButtonState(): void {
    if (!this.playLayoutButton) {
      return;
    }
    const disabled = this.playLayoutInProgress || this.placedEntities.length === 0;
    this.playLayoutButton.disabled = disabled;
    this.playLayoutButton.style.opacity = disabled ? "0.5" : "1";
    this.playLayoutButton.style.cursor = disabled ? "not-allowed" : "pointer";
  }

  private async handlePlayLayout(): Promise<void> {
    if (this.playLayoutInProgress) {
      return;
    }
    const layout = this.buildLayoutSnapshot();
    if (layout.length === 0) {
      console.warn("[EditorScene] Cannot play layout: no entities placed");
      return;
    }

    this.playLayoutInProgress = true;
    this.updatePlayLayoutButtonState();
    try {
      console.log(`[EditorScene] Launching layout with ${layout.length} entities`);
      await this.sceneManager.goToDungeonFromLayout(layout);
    } catch (error) {
      console.warn("[EditorScene] Failed to play layout", error);
    } finally {
      this.playLayoutInProgress = false;
      this.updatePlayLayoutButtonState();
    }
  }
}
