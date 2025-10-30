import {
  AbstractMesh,
  Color3,
  Color4,
  Engine,
  HemisphericLight,
  Mesh,
  MeshBuilder,
  Nullable,
  PBRMaterial,
  PointLight,
  Scene,
  Scalar,
  StandardMaterial,
  TransformNode,
  Vector3,
  VertexData,
} from "babylonjs";
import type { Observer } from "babylonjs/Misc/observable";
import type { SceneBase } from "./SceneBase";
import type { SceneManager } from "../core/SceneManager";
import { Input } from "../core/Input";
import { Player, type PlayerCollider } from "../gameplay/Player";
import { Enemy } from "../gameplay/Enemy";
import { CombatSystem } from "../gameplay/CombatSystem";
import { CameraRig } from "../visuals/CameraRig";
import { SaveService } from "../state/SaveService";
import { HudUI, type HudState } from "../ui/HudUI";
import { FloatingText } from "../ui/FloatingText";
import { MaterialLibrary } from "../visuals/MaterialLibrary";
import {
  VisualPresetManager,
  type LightPresetConfig,
  type VisualControlId,
} from "../visuals/VisualPresetManager";
import { EffectsFactory } from "../visuals/EffectsFactory";
import { PostFXConfig } from "../visuals/PostFXConfig";
import type { LightParams, PlacedEntity } from "./layouts/LayoutTypes";
import { DEFAULT_FILL_LIGHT, DEFAULT_TORCH_LIGHT } from "./layouts/LayoutTypes";

const TILE_SIZE = 2.4;
const TILE_THICKNESS = 0.3;
const LEVEL_HEIGHT = 1.2;
const WALL_THICKNESS_RATIO = 0.35;
const WALL_HEIGHT = 3;
const PILLAR_HEIGHT = 3;
const PROP_CRATE_SIZE = TILE_SIZE * 0.75;
const PROP_CRATE_HEIGHT = TILE_SIZE * 0.8;
const PROP_BONES_HEIGHT = TILE_SIZE * 0.3;
const SPAWN_MARKER_HEIGHT = 0.3;
const TORCH_LIGHT_OFFSET_Y = 0.5;
const FILL_LIGHT_HEIGHT = 2.4;
const CAMERA_ZOOM_SPEED = 0.01;

type LayoutMaterials = {
  floor: StandardMaterial | PBRMaterial;
  wall: StandardMaterial;
  pillar: StandardMaterial;
  ramp: StandardMaterial;
  crate: StandardMaterial;
  bones: StandardMaterial;
  enemySpawn: StandardMaterial;
  playerSpawn: StandardMaterial;
  lightTorch: StandardMaterial;
  lightFill: StandardMaterial;
};

const cloneLightParams = (params?: LightParams): LightParams | undefined => {
  if (!params) {
    return undefined;
  }
  return {
    color: [...params.color] as [number, number, number],
    intensity: params.intensity,
    range: params.range,
  };
};

const cloneLayout = (layout: PlacedEntity[]): PlacedEntity[] =>
  layout.map((entity) => ({
    ...entity,
    pos: { ...entity.pos },
    params: cloneLightParams(entity.params),
  }));

export class DungeonScene implements SceneBase {
  private readonly sceneManager: SceneManager;
  private scene: Scene | null = null;
  private input: Input | null = null;
  private player: Player | null = null;
  private cameraRig: CameraRig | null = null;
  private combatSystem: CombatSystem | null = null;
  private hemiLight: HemisphericLight | null = null;
  private layoutRoot: TransformNode | null = null;
  private layoutMeshes: AbstractMesh[] = [];
  private torchLights: PointLight[] = [];
  private fillLights: PointLight[] = [];
  private exitPortal: Mesh | null = null;
  private enemies: Enemy[] = [];
  private colliders: PlayerCollider[] = [];
  private enemySpawnPoints: Vector3[] = [];
  private playerSpawnPoint: Vector3 | null = null;
  private playerSpawnRotation: number = 0;
  private pendingLayout: PlacedEntity[] | null = null;
  private activeLayout: PlacedEntity[] = [];
  private layoutMaterials: LayoutMaterials | null = null;
  private transitionRequested: boolean = false;
  private deathHandled: boolean = false;
  private debugSpawnCooldown: number = 0;
  private readonly exitPortalDistanceSq: number = 4;
  private visualReady: boolean = false;
  private pendingVisualApply: boolean = false;
  private cameraReadyObserver: Nullable<Observer<Scene>> = null;
  private cameraReadyObserverSource: "activeCamera" | "beforeRender" | null = null;

  constructor(sceneManager: SceneManager, layout?: PlacedEntity[]) {
    this.sceneManager = sceneManager;
    if (layout?.length) {
      this.setPendingLayout(layout);
    }
  }

  setPendingLayout(layout: PlacedEntity[]): void {
    this.pendingLayout = cloneLayout(layout);
  }

  async load(engine: Engine): Promise<void> {
    this.scene = new Scene(engine);
    this.scene.clearColor = new Color4(0.02, 0.02, 0.03, 1);
    this.scene.ambientColor = new Color3(0.12, 0.12, 0.14);

    this.hemiLight = new HemisphericLight("dungeon.hemi", new Vector3(0, 1, 0), this.scene);
    this.hemiLight.intensity = 0.6;
    this.hemiLight.specular = Color3.Black();

    this.input = new Input();
    this.combatSystem = new CombatSystem();
    this.colliders = [];
    this.enemySpawnPoints = [];
    this.transitionRequested = false;
    this.deathHandled = false;
    this.debugSpawnCooldown = 0;

    await this.initializeVisualPipeline();
    await this.ensureLayoutMaterials();

    if (this.pendingLayout) {
      await this.loadFromLayout(this.pendingLayout);
      this.pendingLayout = null;
    } else {
      console.warn("[DungeonScene] No layout provided. Building fallback arena.");
      await this.buildFallbackLayout();
    }

    await this.spawnPlayer();
    HudUI.init();
    FloatingText.init();
    HudUI.setGameplayHudVisible(true);
    HudUI.setVisualControlPanelVisible(true);
    HudUI.onClickAttack(() => {
      this.input?.triggerVirtualAttack();
    });
    HudUI.onClickDodge(() => {
      this.input?.triggerVirtualDodge();
    });
    HudUI.onClickEnterDungeon(null);
    HudUI.onClickSpawn(() => {
      void this.spawnTestEnemy();
    });
    HudUI.onClickVisualPreset(() => {
      this.cycleVisualPreset("HUD button");
    });
    HudUI.onFxIntensityChanged((value) => {
      this.updateFxIntensity(value);
    });
    HudUI.onVisualControlChanged((id, value) => {
      this.handleVisualControlChange(id, value);
    });
    HudUI.setVisualControls(VisualPresetManager.getVisualControlDefinitions());
    this.syncVisualControlValues();
    HudUI.setVisualPresetLabel(VisualPresetManager.getActivePresetName());
    HudUI.setFxIntensity(VisualPresetManager.getEffectIntensity());

    await this.spawnInitialEnemies(Math.min(2, this.enemySpawnPoints.length));

    console.log(
      `[DungeonScene] Loaded layout with ${this.activeLayout.length} entities and ${this.enemySpawnPoints.length} enemy_spawn markers`
    );
  }

  update(deltaTime: number): void {
    if (!this.scene || !this.input || !this.player || !this.cameraRig || !this.combatSystem) {
      return;
    }

    this.player.setInvincible(HudUI.getInvincibilityState());

    this.player.update(deltaTime);
    const playerDead = this.player.isDead();

    this.updateHud(playerDead);

    if (playerDead) {
      this.handlePlayerDeath();
    } else {
      for (const enemy of this.enemies) {
        try {
          enemy.update(deltaTime, this.player);
        } catch (error) {
          console.error("[DungeonScene] Enemy update failed", error);
        }
      }

      if (this.player.consumeAttackTrigger()) {
        this.combatSystem.playerAttack(this.player, this.enemies);
      }

      this.cleanupDeadEnemies();
      FloatingText.updateAll(deltaTime);

      if (this.debugSpawnCooldown > 0) {
        this.debugSpawnCooldown -= deltaTime;
      } else if (this.input.consumeSpawnEnemy()) {
        this.debugSpawnCooldown = 0.5;
        void this.spawnTestEnemy();
      }

      if (this.input.consumePostFxToggle()) {
        this.cycleVisualPreset("keyboard");
      }

      const zoomDelta = this.input.consumeZoomDelta();
      if (zoomDelta !== 0) {
        this.cameraRig.zoomBy(zoomDelta * CAMERA_ZOOM_SPEED);
      }

      this.checkExitPortal();
    }

    if (this.transitionRequested) {
      return;
    }

    this.cameraRig.update(deltaTime);
  }

  getScene(): Scene {
    if (!this.scene) {
      throw new Error("DungeonScene has not been initialized");
    }
    return this.scene;
  }

  dispose(): void {
    for (const enemy of this.enemies) {
      try {
        enemy.dispose();
      } catch (error) {
        console.warn("[DungeonScene] Failed to dispose enemy", error);
      }
    }
    this.enemies = [];
    Enemy.clearVisualPool();

    this.player?.setCollidersProvider(null);
    this.input?.dispose();
    this.cameraRig?.dispose();
    this.clearLayout();
    this.detachCameraReadyObserver();
    PostFXConfig.dispose();

    this.scene?.dispose();

    this.scene = null;
    this.input = null;
    this.player = null;
    this.cameraRig = null;
    this.combatSystem = null;
    this.hemiLight = null;
    this.exitPortal = null;
    this.colliders = [];
    this.enemySpawnPoints = [];
    this.playerSpawnPoint = null;
    this.transitionRequested = false;
    this.deathHandled = false;
    this.pendingVisualApply = false;
  }

  async loadFromLayout(layoutData: PlacedEntity[]): Promise<void> {
    if (!this.scene) {
      this.setPendingLayout(layoutData);
      return;
    }

    await this.ensureLayoutMaterials();

    this.clearLayout();
    this.colliders = [];
    this.enemySpawnPoints = [];
    this.playerSpawnPoint = null;
    this.playerSpawnRotation = 0;
    this.activeLayout = cloneLayout(layoutData);

    this.layoutRoot = new TransformNode("dungeon.layoutRoot", this.scene);

    layoutData.forEach((entity, index) => {
      this.placeEntity(entity, index);
    });

    if (!this.playerSpawnPoint) {
      this.playerSpawnPoint = Vector3.Zero();
      this.playerSpawnRotation = 0;
      console.warn("[DungeonScene] Layout missing player_spawn marker. Using origin.");
    }

    if (!this.exitPortal) {
      this.createExitPortal(this.playerSpawnPoint);
    }

    if (this.player) {
      this.player.setCollidersProvider(() => this.colliders);
      this.player.setSpawnPoint(this.playerSpawnPoint.clone(), this.playerSpawnRotation);
      this.player.teleportToSpawn();
    }

    this.pendingVisualApply = true;
    if (this.visualReady) {
      this.scheduleVisualPresetApply();
    }
  }

  async spawnTestEnemy(): Promise<void> {
    if (!this.scene) {
      return;
    }
    if (this.enemySpawnPoints.length === 0) {
      console.warn("[DungeonScene] No enemy_spawn markers in layout");
      return;
    }
    const spawnPos = this.enemySpawnPoints[0].clone();
    await this.spawnEnemyAt(spawnPos);
  }

  private async initializeVisualPipeline(): Promise<void> {
    if (this.visualReady) {
      return;
    }

    try {
      await VisualPresetManager.initialize();
      this.visualReady = true;
    } catch (error) {
      this.visualReady = false;
      console.warn("[DungeonScene] Failed to initialize visual preset manager", error);
    }

    this.pendingVisualApply = true;
    this.scheduleVisualPresetApply();
  }

  private async ensureLayoutMaterials(): Promise<void> {
    if (!this.scene || this.layoutMaterials) {
      return;
    }

    try {
      const stone = await MaterialLibrary.buildStoneFloorMaterials(this.scene);
      const createMaterial = (name: string, diffuse: Color3): StandardMaterial => {
        const material = new StandardMaterial(name, this.scene!);
        material.diffuseColor = diffuse;
        material.specularColor = new Color3(0.05, 0.05, 0.05);
        return material;
      };

      this.layoutMaterials = {
        floor: stone.base,
        wall: createMaterial("dungeon.wallMat", new Color3(0.36, 0.32, 0.28)),
        pillar: createMaterial("dungeon.pillarMat", new Color3(0.5, 0.46, 0.42)),
        ramp: createMaterial("dungeon.rampMat", new Color3(0.38, 0.28, 0.2)),
        crate: createMaterial("dungeon.crateMat", new Color3(0.52, 0.36, 0.2)),
        bones: createMaterial("dungeon.bonesMat", new Color3(0.82, 0.78, 0.72)),
        enemySpawn: createMaterial("dungeon.enemySpawnMat", new Color3(0.72, 0.18, 0.18)),
        playerSpawn: createMaterial("dungeon.playerSpawnMat", new Color3(0.18, 0.6, 0.82)),
        lightTorch: createMaterial("dungeon.lightTorchMat", new Color3(0.95, 0.58, 0.32)),
        lightFill: createMaterial("dungeon.lightFillMat", new Color3(0.52, 0.68, 0.95)),
      };
    } catch (error) {
      console.warn("[DungeonScene] Failed to build layout materials, using fallbacks", error);
      const fallback = new StandardMaterial("dungeon.fallback", this.scene);
      fallback.diffuseColor = new Color3(0.4, 0.42, 0.46);
      fallback.specularColor = Color3.Black();
      this.layoutMaterials = {
        floor: fallback,
        wall: fallback,
        pillar: fallback,
        ramp: fallback,
        crate: fallback,
        bones: fallback,
        enemySpawn: fallback,
        playerSpawn: fallback,
        lightTorch: fallback,
        lightFill: fallback,
      };
    }
  }

  private async buildFallbackLayout(): Promise<void> {
    const fallback: PlacedEntity[] = [
      {
        type: "floor",
        pos: { x: 0, y: TILE_THICKNESS / 2, z: 0 },
        rotY: 0,
        scale: 2.5,
      },
      {
        type: "player_spawn",
        pos: { x: -2, y: SPAWN_MARKER_HEIGHT / 2, z: -2 },
        rotY: 0,
        scale: 1,
      },
      {
        type: "enemy_spawn",
        pos: { x: 2, y: SPAWN_MARKER_HEIGHT / 2, z: 2 },
        rotY: 0,
        scale: 1,
      },
      {
        type: "light_torch",
        pos: { x: -2, y: 0.7, z: 2 },
        rotY: 0,
        scale: 1,
        params: cloneLightParams(DEFAULT_TORCH_LIGHT),
      },
      {
        type: "light_fill",
        pos: { x: 0, y: 0, z: 0 },
        rotY: 0,
        scale: 1,
        params: cloneLightParams(DEFAULT_FILL_LIGHT),
      },
    ];

    await this.loadFromLayout(fallback);
  }

  private clearLayout(): void {
    for (const mesh of this.layoutMeshes.splice(0)) {
      try {
        mesh.dispose();
      } catch (error) {
        console.warn("[DungeonScene] Failed to dispose layout mesh", error);
      }
    }
    for (const light of this.torchLights.splice(0)) {
      light.dispose();
    }
    for (const light of this.fillLights.splice(0)) {
      light.dispose();
    }
    this.exitPortal?.dispose();
    this.exitPortal = null;

    if (this.layoutRoot) {
      this.layoutRoot.dispose();
      this.layoutRoot = null;
    }
  }

  private placeEntity(entity: PlacedEntity, index: number): void {
    if (!this.scene || !this.layoutMaterials) {
      return;
    }

    const scale = Number.isFinite(entity.scale) ? Math.max(0.1, entity.scale) : 1;
    const radians = (entity.rotY ?? 0) * (Math.PI / 180);
    const position = new Vector3(entity.pos.x, entity.pos.y, entity.pos.z);
    const name = `dungeon.entity.${entity.type}.${index}`;

    switch (entity.type) {
      case "floor": {
        const mesh = MeshBuilder.CreateBox(
          name,
          { width: TILE_SIZE * scale, depth: TILE_SIZE * scale, height: TILE_THICKNESS },
          this.scene
        );
        this.finalizeMesh(mesh, position, radians, this.layoutMaterials.floor);
        mesh.receiveShadows = true;
        break;
      }
      case "wall": {
        const wallThickness = TILE_SIZE * WALL_THICKNESS_RATIO;
        const baseWidth = TILE_SIZE + wallThickness;
        const baseDepth = wallThickness;
        const rotationIndex = Math.round(((entity.rotY % 360) + 360) % 360 / 90) % 4;
        const width = rotationIndex % 2 === 0 ? baseWidth : baseDepth;
        const depth = rotationIndex % 2 === 0 ? baseDepth : baseWidth;

        const mesh = MeshBuilder.CreateBox(
          name,
          { width, depth, height: WALL_HEIGHT },
          this.scene
        );
        this.finalizeMesh(mesh, position, radians, this.layoutMaterials.wall);
        this.addCollider(mesh.position, width, depth);
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
        const normals: number[] = [];
        VertexData.ComputeNormals(positions, indices, normals);
        const vertexData = new VertexData();
        vertexData.positions = positions;
        vertexData.indices = indices;
        vertexData.uvs = uvs;
        vertexData.normals = normals;
        vertexData.applyToMesh(ramp);
        this.finalizeMesh(ramp, position, radians, this.layoutMaterials.ramp);
        break;
      }
      case "pillar": {
        const diameter = TILE_SIZE * 0.45;
        const mesh = MeshBuilder.CreateCylinder(
          name,
          { diameter, height: PILLAR_HEIGHT },
          this.scene
        );
        this.finalizeMesh(mesh, position, radians, this.layoutMaterials.pillar);
        this.addCollider(mesh.position, diameter, diameter);
        break;
      }
      case "prop_crate": {
        const mesh = MeshBuilder.CreateBox(
          name,
          { width: PROP_CRATE_SIZE, height: PROP_CRATE_HEIGHT, depth: PROP_CRATE_SIZE },
          this.scene
        );
        this.finalizeMesh(mesh, position, radians, this.layoutMaterials.crate);
        break;
      }
      case "prop_bones": {
        const mesh = MeshBuilder.CreateCylinder(
          name,
          { diameter: TILE_SIZE * 0.6, height: PROP_BONES_HEIGHT },
          this.scene
        );
        this.finalizeMesh(mesh, position, radians, this.layoutMaterials.bones);
        break;
      }
      case "light_torch": {
        const mesh = MeshBuilder.CreateCylinder(
          `${name}.marker`,
          { diameter: TILE_SIZE * 0.32, height: 1.2 },
          this.scene
        );
        this.finalizeMesh(mesh, position, radians, this.layoutMaterials.lightTorch);
        const params = entity.params ?? DEFAULT_TORCH_LIGHT;
        const light = new PointLight(
          `${name}.light`,
          new Vector3(position.x, position.y + TORCH_LIGHT_OFFSET_Y, position.z),
          this.scene
        );
        light.diffuse = Color3.FromArray(params.color);
        light.intensity = params.intensity;
        light.range = params.range;
        this.torchLights.push(light);
        break;
      }
      case "light_fill": {
        const mesh = MeshBuilder.CreateCylinder(
          `${name}.marker`,
          { diameter: TILE_SIZE * 0.95, height: SPAWN_MARKER_HEIGHT },
          this.scene
        );
        this.finalizeMesh(mesh, position, radians, this.layoutMaterials.lightFill);
        const params = entity.params ?? DEFAULT_FILL_LIGHT;
        const light = new PointLight(
          `${name}.light`,
          new Vector3(position.x, position.y + FILL_LIGHT_HEIGHT, position.z),
          this.scene
        );
        light.diffuse = Color3.FromArray(params.color);
        light.intensity = params.intensity;
        light.range = params.range;
        this.fillLights.push(light);
        break;
      }
      case "enemy_spawn": {
        const mesh = MeshBuilder.CreateCylinder(
          name,
          { diameter: TILE_SIZE * 0.7, height: SPAWN_MARKER_HEIGHT },
          this.scene
        );
        this.finalizeMesh(mesh, position, radians, this.layoutMaterials.enemySpawn);
        this.enemySpawnPoints.push(position.clone());
        break;
      }
      case "player_spawn": {
        const mesh = MeshBuilder.CreateCylinder(
          name,
          { diameter: TILE_SIZE * 0.7, height: SPAWN_MARKER_HEIGHT },
          this.scene
        );
        this.finalizeMesh(mesh, position, radians, this.layoutMaterials.playerSpawn);
        if (!this.playerSpawnPoint) {
          this.playerSpawnPoint = position.clone();
          this.playerSpawnRotation = radians;
        } else {
          console.warn("[DungeonScene] Multiple player_spawn markers detected. Using the first one.");
        }
        break;
      }
      default:
        console.warn("[DungeonScene] Unknown entity type in layout:", entity.type);
    }
  }

  private finalizeMesh(
    mesh: AbstractMesh,
    position: Vector3,
    rotationY: number,
    material: StandardMaterial | PBRMaterial
  ): void {
    mesh.position.copyFrom(position);
    mesh.rotation.y = rotationY;
    mesh.isPickable = false;
    mesh.material = material;
    if (this.layoutRoot) {
      mesh.parent = this.layoutRoot;
    }
    if (mesh instanceof Mesh) {
      this.layoutMeshes.push(mesh);
    }
  }

  private createExitPortal(spawnPoint: Vector3): void {
    if (!this.scene) {
      return;
    }
    const material = new StandardMaterial("dungeon.exitPortalMat", this.scene);
    material.diffuseColor = new Color3(0.12, 0.28, 0.5);
    material.emissiveColor = new Color3(0.24, 0.6, 0.95);

    this.exitPortal = MeshBuilder.CreateCylinder(
      "dungeon.exitPortal",
      { diameter: 1.6, height: 0.3 },
      this.scene
    );
    this.exitPortal.position.set(spawnPoint.x + 2.2, spawnPoint.y + 0.15, spawnPoint.z + 2.2);
    this.exitPortal.material = material;
  }

  private async spawnPlayer(): Promise<void> {
    if (!this.scene || !this.input) {
      return;
    }
    try {
      this.player = await Player.createAsync(this.scene, this.input);
    } catch (error) {
      console.error("[DungeonScene] Failed to load player character, using placeholder", error);
      const placeholder = MeshBuilder.CreateBox("dungeon.playerPlaceholder", { size: 1.4 }, this.scene);
      placeholder.position.y = 1;
      this.player = Player.createPlaceholder(this.scene, placeholder, this.input);
    }

    const spawnPosition = this.playerSpawnPoint ? this.playerSpawnPoint.clone() : Vector3.Zero();
    const spawnFacing = this.playerSpawnRotation;

    this.player.syncFromSave();
    this.player.setSpawnPoint(spawnPosition, spawnFacing);
    this.player.teleportToSpawn();
    this.player.setCollidersProvider(() => this.colliders);

    this.cameraRig = new CameraRig(this.scene, this.player.getMesh());
    this.cameraRig.update();
    if (this.visualReady || this.pendingVisualApply) {
      this.applyCurrentVisualPreset();
    }
  }

  private async spawnInitialEnemies(count: number): Promise<void> {
    if (!this.scene || count <= 0) {
      return;
    }
    const promises: Array<Promise<void>> = [];
    for (let i = 0; i < count; i++) {
      promises.push(this.spawnEnemyAt(this.getRandomSpawnPosition()));
    }
    await Promise.all(promises);
  }

  private async spawnEnemyAt(position: Vector3): Promise<void> {
    if (!this.scene) {
      return;
    }
    try {
      const enemy = await Enemy.create(this.scene, position);
      this.enemies.push(enemy);
    } catch (error) {
      console.error("[DungeonScene] Failed to spawn enemy", error);
    }
  }

  private getRandomSpawnPosition(): Vector3 {
    if (this.enemySpawnPoints.length === 0) {
      return this.playerSpawnPoint ? this.playerSpawnPoint.clone() : Vector3.Zero();
    }
    const index = Math.floor(Math.random() * this.enemySpawnPoints.length);
    return this.enemySpawnPoints[index].clone();
  }

  private cleanupDeadEnemies(): void {
    if (this.enemies.length === 0) {
      return;
    }
    this.enemies = this.enemies.filter((enemy) => {
      if (enemy.isDead()) {
        enemy.dispose();
        return false;
      }
      return true;
    });
  }

  private checkExitPortal(): void {
    if (this.transitionRequested || !this.exitPortal || !this.player) {
      return;
    }
    const distanceSq = Vector3.DistanceSquared(this.player.getPosition(), this.exitPortal.position);
    if (distanceSq <= this.exitPortalDistanceSq) {
      this.transitionRequested = true;
      void this.sceneManager
        .goToHideout()
        .catch((error) => {
          console.error("[DungeonScene] Failed to return to hideout", error);
          this.transitionRequested = false;
        });
    }
  }

  private handlePlayerDeath(): void {
    if (this.deathHandled) {
      return;
    }
    this.deathHandled = true;
    this.transitionRequested = true;
    console.log("[DungeonScene] Player died, returning to hideout");
    SaveService.resetHPFull();
    void this.sceneManager
      .goToHideout()
      .catch((error) => {
        console.error("[DungeonScene] Failed to transition after death", error);
        this.deathHandled = false;
        this.transitionRequested = false;
      });
  }

  private addCollider(center: Vector3, width: number, depth: number): void {
    const halfWidth = width / 2;
    const halfDepth = depth / 2;
    this.colliders.push({
      minX: center.x - halfWidth,
      maxX: center.x + halfWidth,
      minZ: center.z - halfDepth,
      maxZ: center.z + halfDepth,
    });
  }

  private updateHud(playerDead: boolean): void {
    if (!this.player) {
      return;
    }

    const profile = SaveService.getProfile();
    const hudState: HudState = {
      hp: this.player.hp,
      maxHP: this.player.maxHP,
      stamina: this.player.stamina,
      maxStamina: this.player.maxStamina,
      xp: profile.xp,
      level: profile.level,
      xpForNextLevel: SaveService.getXPThreshold(),
      showEnterPrompt: false,
      showDeathBanner: playerDead || this.deathHandled,
      cooldowns: {
        attackReady: !playerDead,
        dodgeReady: !playerDead,
        skill1Ready: false,
        skill2Ready: false,
      },
    };

    HudUI.update(hudState);
  }

  private cycleVisualPreset(source: string): void {
    if (!this.scene || !this.visualReady) {
      return;
    }
    const presetName = VisualPresetManager.cyclePreset();
    console.log(`[DungeonScene] Switched visual preset to ${presetName} via ${source}`);
    this.applyCurrentVisualPreset();
  }

  private updateFxIntensity(value: number): void {
    if (!Number.isFinite(value)) {
      return;
    }
    const clamped = Math.max(0, Math.min(1, value));
    VisualPresetManager.setEffectIntensity(clamped);
    HudUI.setFxIntensity(clamped);
    this.applyCurrentVisualPreset();
  }

  private handleVisualControlChange(id: VisualControlId, value: number): void {
    if (!this.visualReady) {
      return;
    }
    const applied = VisualPresetManager.setControlValue(id, value);
    if (!applied) {
      console.warn("[DungeonScene] Unknown visual control id", id);
      return;
    }
    this.applyCurrentVisualPreset();
  }

  private syncVisualControlValues(): void {
    if (!this.visualReady) {
      return;
    }
    const definitions = VisualPresetManager.getVisualControlDefinitions();
    for (const definition of definitions) {
      const current = VisualPresetManager.getControlValue(definition.id);
      if (current !== undefined) {
        HudUI.updateVisualControlValue(definition.id, current);
      }
    }
  }

  private applyCurrentVisualPreset(): void {
    if (!this.scene || !this.visualReady) {
      return;
    }
    if (!this.scene.activeCamera) {
      this.pendingVisualApply = true;
      this.scheduleVisualPresetApply();
      return;
    }
    this.pendingVisualApply = false;
    this.detachCameraReadyObserver();
    const preset = VisualPresetManager.getActivePreset();
    const intensity = VisualPresetManager.getEffectIntensity();

    PostFXConfig.applyPreset(
      preset.postfx ?? undefined,
      intensity,
      VisualPresetManager.getPostFXOverrides()
    );
    PostFXConfig.apply(this.scene);

    this.applyLightPreset(preset.lights ?? undefined, intensity);
    EffectsFactory.setGlobalIntensity(intensity);
    HudUI.setVisualPresetLabel(VisualPresetManager.getActivePresetName());
    HudUI.setFxIntensity(intensity);
    this.syncVisualControlValues();
  }

  private scheduleVisualPresetApply(): void {
    if (!this.scene || !this.visualReady) {
      return;
    }
    if (this.scene.activeCamera) {
      this.applyCurrentVisualPreset();
      return;
    }
    if (this.cameraReadyObserver) {
      return;
    }
    const activeCameraObservable = this.scene.onActiveCameraChangedObservable;
    if (activeCameraObservable && typeof activeCameraObservable.add === "function") {
      this.cameraReadyObserverSource = "activeCamera";
      this.cameraReadyObserver = activeCameraObservable.add((scene) => {
        if (!scene.activeCamera) {
          return;
        }
        this.detachCameraReadyObserver();
        this.applyCurrentVisualPreset();
      });
      return;
    }

    const beforeRenderObservable = this.scene.onBeforeRenderObservable;
    if (beforeRenderObservable && typeof beforeRenderObservable.add === "function") {
      this.cameraReadyObserverSource = "beforeRender";
      this.cameraReadyObserver = beforeRenderObservable.add(() => {
        if (!this.scene || !this.scene.activeCamera) {
          return;
        }
        this.detachCameraReadyObserver();
        this.applyCurrentVisualPreset();
      });
      return;
    }

    console.warn(
      "[DungeonScene] Camera readiness observables unavailable; applying visual preset immediately."
    );
    this.applyCurrentVisualPreset();
  }

  private detachCameraReadyObserver(): void {
    if (!this.scene || !this.cameraReadyObserver) {
      this.cameraReadyObserver = null;
      this.cameraReadyObserverSource = null;
      return;
    }
    if (this.cameraReadyObserverSource === "activeCamera") {
      this.scene.onActiveCameraChangedObservable.remove(this.cameraReadyObserver);
    } else if (this.cameraReadyObserverSource === "beforeRender") {
      this.scene.onBeforeRenderObservable.remove(this.cameraReadyObserver);
    }
    this.cameraReadyObserver = null;
    this.cameraReadyObserverSource = null;
  }

  private applyLightPreset(preset: LightPresetConfig | null | undefined, intensityScale: number): void {
    if (!this.visualReady) {
      return;
    }

    const overrides = VisualPresetManager.getLightOverrides();

    const resolve = (value: number | undefined, fallback: number, label: string): number => {
      if (value === undefined) {
        return fallback;
      }
      if (Number.isFinite(value)) {
        return value as number;
      }
      console.warn("[DungeonScene] Invalid light preset value for", label, value);
      return fallback;
    };

    const fallbackWarmIntensity = DEFAULT_TORCH_LIGHT.intensity;
    const fallbackWarmRange = DEFAULT_TORCH_LIGHT.range;
    const fallbackCoolIntensity = DEFAULT_FILL_LIGHT.intensity;
    const fallbackCoolRange = DEFAULT_FILL_LIGHT.range;
    const fallbackHemi = this.hemiLight?.intensity ?? 0.6;

    const warmIntensity =
      resolve(overrides.warmLightIntensity ?? preset?.warmLightIntensity, fallbackWarmIntensity, "warmLightIntensity") *
      intensityScale;
    const warmRange = resolve(overrides.warmLightRange ?? preset?.warmLightRange, fallbackWarmRange, "warmLightRange");
    const coolIntensity =
      resolve(overrides.coolFillIntensity ?? preset?.coolFillIntensity, fallbackCoolIntensity, "coolFillIntensity") *
      intensityScale;
    const coolRange =
      resolve(overrides.coolFillRange ?? preset?.coolFillRange, fallbackCoolRange, "coolFillRange");
    const hemiIntensity =
      resolve(overrides.hemiIntensity ?? preset?.hemiIntensity, fallbackHemi, "hemiIntensity") * intensityScale;

    for (const light of this.torchLights) {
      light.intensity = warmIntensity;
      light.range = warmRange;
    }
    for (const light of this.fillLights) {
      light.intensity = coolIntensity;
      light.range = coolRange;
    }
    if (this.hemiLight) {
      this.hemiLight.intensity = hemiIntensity;
    }

    VisualPresetManager.updateCurrentLightState({
      warmLightIntensity: warmIntensity,
      warmLightRange: warmRange,
      coolFillIntensity: coolIntensity,
      coolFillRange: coolRange,
      hemiIntensity,
    });
  }
}
