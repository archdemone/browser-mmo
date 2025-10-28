import {
  Color3,
  Color4,
  Engine,
  HemisphericLight,
  Mesh,
  MeshBuilder,
  Ray,
  Scene,
  StandardMaterial,
  Texture,
  Vector3,
  Scalar,
} from "babylonjs";
import { Input } from "../core/Input";
import type { SceneBase } from "./SceneBase";
import { Player, type PlayerCollider } from "../gameplay/Player";
import { CameraRig } from "../visuals/CameraRig";
import type { SceneManager } from "../core/SceneManager";
import { HudUI, type HudState } from "../ui/HudUI";
import { SaveService } from "../state/SaveService";
import { Enemy } from "../gameplay/Enemy";

interface OccluderController {
  mesh: Mesh;
  material: StandardMaterial;
  currentAlpha: number;
  targetAlpha: number;
}

interface SpawnArea {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

interface HideoutMaterials {
  floor: StandardMaterial;
  floorBroken: StandardMaterial;
  wall: StandardMaterial;
  railing: StandardMaterial;
  pillar: StandardMaterial;
  crate: StandardMaterial;
  bone: StandardMaterial;
  rune: StandardMaterial;
  cliff: StandardMaterial;
  blood: StandardMaterial;
  device: StandardMaterial;
  deviceBase: StandardMaterial;
  occluderPillarA: StandardMaterial;
  occluderPillarB: StandardMaterial;
  occluderTree: StandardMaterial;
}

interface PlatformLayout {
  center: Vector3;
  frontZ: number;
  backZ: number;
  halfWidth: number;
  depth: number;
  cols: number;
  rows: number;
  tileSize: number;
}

interface RampLayout {
  startZ: number;
  endZ: number;
  halfWidth: number;
  zPositions: number[];
}

interface LowerArenaLayout {
  frontZ: number;
  centerZ: number;
  halfWidth: number;
  width: number;
  depth: number;
}

interface TileCounter {
  value: number;
}

export class HideoutScene implements SceneBase {
  private readonly sceneManager: SceneManager;
  private scene: Scene | null = null;
  private input: Input | null = null;
  private player: Player | null = null;
  private cameraRig: CameraRig | null = null;
  private dungeonDevice: Mesh | null = null;
  private colliders: PlayerCollider[] = [];
  private enemies: Enemy[] = [];
  private occluders: OccluderController[] = [];
  private occluderLookup: Set<Mesh> = new Set();
  private transitionRequested: boolean = false;
  private readonly deviceInteractDistanceSq: number = 4;
  private interactCooldown: number = 0;
  private readonly maxStamina: number = 100;
  private platformHeight: number = 1.2;
  private rampStartZ: number = -5.2;
  private rampEndZ: number = -0.8;
  private rampHalfWidth: number = 2.6;
  private spawnArea: SpawnArea = { minX: -4, maxX: 4, minZ: -1, maxZ: 4 };

  constructor(sceneManager: SceneManager) {
    this.sceneManager = sceneManager;
  }

  private registerOccluder(mesh: Mesh, material: StandardMaterial): void {
    material.alpha = 1;
    material.transparencyMode = StandardMaterial.MATERIAL_ALPHABLEND;
    mesh.isPickable = true;
    this.occluders.push({ mesh, material, currentAlpha: 1, targetAlpha: 1 });
    this.occluderLookup.add(mesh);
  }

  private updatePlayerHeight(deltaTime: number): void {
    if (!this.player) {
      return;
    }

    const mesh = this.player.getMesh();
    const targetY = this.sampleHeight(mesh.position);
    const currentY = mesh.position.y;
    const newY = Scalar.MoveTowards(currentY, targetY, deltaTime * 6);
    mesh.position.y = newY;
  }

  private updateOccluderFades(deltaTime: number): void {
    if (!this.scene || !this.player || this.occluders.length === 0) {
      return;
    }

    const camera = this.scene.activeCamera;
    if (!camera) {
      return;
    }

    const playerMesh = this.player.getMesh();
    const cameraPosition = camera.position.clone();
    const playerPosition = playerMesh.getAbsolutePosition();
    const direction = playerPosition.subtract(cameraPosition);
    const distance = direction.length();
    if (distance <= 0.1) {
      return;
    }

    direction.normalize();
    const ray = new Ray(cameraPosition, direction, distance);
    const hits = this.scene.multiPickWithRay(ray, (mesh) => this.occluderLookup.has(mesh as Mesh));
    const blocking = new Set<Mesh>();
    if (hits) {
      for (const hit of hits) {
        if (!hit.pickedMesh) {
          continue;
        }
        const picked = hit.pickedMesh as Mesh;
        if (this.occluderLookup.has(picked) && hit.distance < distance - 0.3) {
          blocking.add(picked);
        }
      }
    }

    const fadeSpeed = 4;
    for (const controller of this.occluders) {
      controller.targetAlpha = blocking.has(controller.mesh) ? 0.3 : 1;
      controller.currentAlpha = Scalar.MoveTowards(
        controller.currentAlpha,
        controller.targetAlpha,
        fadeSpeed * deltaTime
      );
      controller.material.alpha = controller.currentAlpha;
    }
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

  private sampleHeight(position: Vector3): number {
    if (position.z <= this.rampStartZ) {
      return this.platformHeight;
    }

    if (position.z < this.rampEndZ) {
      const width = this.rampHalfWidth + 0.1;
      if (Math.abs(position.x) <= width) {
        const range = this.rampEndZ - this.rampStartZ;
        if (range <= 0.0001) {
          return this.platformHeight;
        }
        const t = Scalar.Clamp((position.z - this.rampStartZ) / range, 0, 1);
        return Scalar.Lerp(this.platformHeight, 0, t);
      }
      return this.platformHeight;
    }

    return 0;
  }

  private randomInRange(min: number, max: number): number {
    if (max <= min) {
      return min;
    }
    return min + Math.random() * (max - min);
  }

  private async spawnEnemyAt(position: Vector3): Promise<void> {
    if (!this.scene) {
      return;
    }

    try {
      const spawnPosition = position.clone();
      spawnPosition.y = this.sampleHeight(spawnPosition);
      const enemy = await Enemy.create(this.scene, spawnPosition);
      this.enemies.push(enemy);
    } catch (error) {
      console.error("[QA] Failed to spawn hideout enemy", error);
    }
  }

  async load(engine: Engine): Promise<void> {
    this.scene = new Scene(engine);
    this.scene.ambientColor = new Color3(0.25, 0.25, 0.3);
    this.scene.clearColor = new Color4(0.02, 0.02, 0.03, 1);

    const hemi = new HemisphericLight("hideout.hemi", new Vector3(0, 1, 0), this.scene);
    hemi.intensity = 1.15;
    hemi.specular = Color3.Black();

    this.input = new Input();
    await this.buildHideoutGeometry();
    await this.spawnPlayer();
    HudUI.init();
    HudUI.onClickAttack(() => {
      this.input?.triggerVirtualAttack();
    });
    HudUI.onClickDodge(() => {
      this.input?.triggerVirtualDodge();
    });
    HudUI.onClickEnterDungeon(() => {
      this.tryEnterDungeon();
    });
    HudUI.onClickSpawn(() => {
      void this.spawnEnemyAt(this.getRandomSpawnPosition());
    });

    console.log("[QA] Hideout loaded");
  }

  update(deltaTime: number): void {
    if (!this.scene || !this.input || !this.player || !this.cameraRig) {
      return;
    }

    // Update player invincibility state from HUD checkbox
    this.player.setInvincible(HudUI.getInvincibilityState());

    this.player.update(deltaTime);
    this.updatePlayerHeight(deltaTime);

    if (this.enemies.length > 0) {
      for (const enemy of this.enemies) {
        try {
          enemy.update(deltaTime, this.player);
        } catch (error) {
          console.error("[QA] Hideout enemy update failed", error);
        }
      }
      this.cleanupDeadEnemies();
    }

    this.updateOccluderFades(deltaTime);

    if (this.interactCooldown > 0) {
      this.interactCooldown = Math.max(0, this.interactCooldown - deltaTime);
    }

    // Consume debug spawn input so hideout never spawns enemies.
    if (this.input.consumeSpawnEnemy()) {
      // Intentionally ignored in hideout.
    }

    const nearDevice = this.isPlayerNearDevice();
    if (!this.transitionRequested && this.interactCooldown <= 0 && nearDevice && this.input.consumeInteract()) {
      this.tryEnterDungeon();
    }

    this.cameraRig.update(deltaTime);
    this.updateHud(nearDevice);
  }

  getScene(): Scene {
    if (!this.scene) {
      throw new Error("HideoutScene has not been initialized");
    }
    return this.scene;
  }

  dispose(): void {
    for (const enemy of this.enemies) {
      try {
        enemy.dispose();
      } catch (error) {
        console.warn("[QA] Failed to dispose hideout enemy", error);
      }
    }
    this.enemies = [];
    Enemy.clearVisualPool();
    this.occluders = [];
    this.occluderLookup.clear();

    this.player?.setCollidersProvider(null);
    this.input?.dispose();
    this.cameraRig?.dispose();
    this.scene?.dispose();

    this.scene = null;
    this.input = null;
    this.player = null;
    this.cameraRig = null;
    this.dungeonDevice = null;
    this.colliders = [];
    this.transitionRequested = false;
    this.interactCooldown = 0;
  }

  private updateHud(nearDevice: boolean): void {
    if (!this.player) {
      return;
    }

    const profile = SaveService.getProfile();
    const hudState: HudState = {
      hp: this.player.hp,
      maxHP: this.player.maxHP,
      // TODO: Replace placeholder stamina with actual resource management once dodge cost lands.
      stamina: this.maxStamina,
      maxStamina: this.maxStamina,
      xp: profile.xp,
      level: profile.level,
      xpForNextLevel: SaveService.getXPThreshold(),
      showEnterPrompt: nearDevice && !this.transitionRequested,
      showDeathBanner: this.player.isDead(),
      cooldowns: {
        attackReady: true,
        dodgeReady: true,
        skill1Ready: false,
        skill2Ready: false,
      },
    };

    HudUI.update(hudState);
  }

  private async buildHideoutGeometry(): Promise<void> {
    if (!this.scene) {
      return;
    }

    this.colliders = [];
    this.enemies = [];
    this.occluders = [];
    this.occluderLookup.clear();

    const scene = this.scene;
    const tileSize = 2.4;
    const tileThickness = 0.32;
    const tileCounter: TileCounter = { value: 0 };

    const materials = this.createMaterials(scene);
    const platform = this.buildPlatform(scene, materials, tileSize, tileThickness, tileCounter);
    const ramp = this.buildRamp(scene, materials, platform, tileSize, tileThickness, tileCounter);
    this.buildLowerArena(scene, materials, tileSize, tileThickness, ramp, tileCounter);
    this.placeDungeonDevice(scene, materials, platform);
    this.placeOccluders(scene, materials, platform);
  }

  private createMaterials(scene: Scene): HideoutMaterials {
    const floorMaterial = new StandardMaterial("hideout.floorTile", scene);
    floorMaterial.diffuseColor = new Color3(0.13, 0.13, 0.17);
    floorMaterial.specularColor = new Color3(0.04, 0.04, 0.05);

    const brokenFloorMaterial = new StandardMaterial("hideout.floorTileBroken", scene);
    brokenFloorMaterial.diffuseColor = new Color3(0.11, 0.11, 0.14);
    brokenFloorMaterial.specularColor = new Color3(0.03, 0.03, 0.04);
    brokenFloorMaterial.emissiveColor = new Color3(0.03, 0.01, 0.01);

    const wallMaterial = new StandardMaterial("hideout.balconyWall", scene);
    wallMaterial.diffuseColor = new Color3(0.18, 0.18, 0.22);
    wallMaterial.specularColor = new Color3(0.05, 0.05, 0.05);

    const railingMaterial = new StandardMaterial("hideout.railing", scene);
    railingMaterial.diffuseColor = new Color3(0.14, 0.14, 0.18);
    railingMaterial.specularColor = new Color3(0.04, 0.04, 0.04);

    const pillarMaterial = new StandardMaterial("hideout.pillar", scene);
    pillarMaterial.diffuseColor = new Color3(0.15, 0.15, 0.19);
    pillarMaterial.specularColor = new Color3(0.05, 0.05, 0.05);

    const crateMaterial = new StandardMaterial("hideout.crate", scene);
    crateMaterial.diffuseColor = new Color3(0.26, 0.16, 0.08);
    crateMaterial.specularColor = new Color3(0.06, 0.04, 0.03);

    const boneMaterial = new StandardMaterial("hideout.bonePile", scene);
    boneMaterial.diffuseColor = new Color3(0.55, 0.5, 0.44);
    boneMaterial.specularColor = new Color3(0.1, 0.1, 0.1);

    const runeMaterial = new StandardMaterial("hideout.runeCircle", scene);
    runeMaterial.diffuseColor = new Color3(0.05, 0.07, 0.08);
    runeMaterial.emissiveColor = new Color3(0.2, 0.6, 0.45);
    runeMaterial.specularColor = Color3.Black();

    const cliffMaterial = new StandardMaterial("hideout.cliff", scene);
    cliffMaterial.diffuseColor = new Color3(0.08, 0.08, 0.1);
    cliffMaterial.specularColor = new Color3(0.02, 0.02, 0.02);

    const bloodTexture = new Texture("/assets/environment/decals/blood_decal.png", scene);
    bloodTexture.hasAlpha = true;
    const bloodMaterial = new StandardMaterial("hideout.bloodDecal", scene);
    bloodMaterial.diffuseTexture = bloodTexture;
    bloodMaterial.useAlphaFromDiffuseTexture = true;
    bloodMaterial.specularColor = Color3.Black();
    bloodMaterial.emissiveColor = Color3.Black();
    bloodMaterial.alpha = 0.85;
    bloodMaterial.backFaceCulling = false;

    const deviceMaterial = new StandardMaterial("hideout.deviceMat", scene);
    deviceMaterial.diffuseColor = new Color3(0.05, 0.12, 0.25);
    deviceMaterial.emissiveColor = new Color3(0.2, 0.5, 1.0);
    deviceMaterial.specularColor = Color3.Black();

    const deviceBaseMaterial = new StandardMaterial("hideout.deviceBaseMat", scene);
    deviceBaseMaterial.diffuseColor = new Color3(0.12, 0.12, 0.15);
    deviceBaseMaterial.specularColor = Color3.Black();

    const occluderPillarA = new StandardMaterial("hideout.occluder.pillarMat1", scene);
    occluderPillarA.diffuseColor = new Color3(0.16, 0.16, 0.2);
    occluderPillarA.specularColor = new Color3(0.05, 0.05, 0.05);

    const occluderPillarB = new StandardMaterial("hideout.occluder.pillarMat2", scene);
    occluderPillarB.diffuseColor = new Color3(0.17, 0.17, 0.21);
    occluderPillarB.specularColor = new Color3(0.05, 0.05, 0.05);

    const occluderTree = new StandardMaterial("hideout.occluder.treeMat", scene);
    occluderTree.diffuseColor = new Color3(0.2, 0.17, 0.12);
    occluderTree.specularColor = new Color3(0.05, 0.04, 0.03);

    return {
      floor: floorMaterial,
      floorBroken: brokenFloorMaterial,
      wall: wallMaterial,
      railing: railingMaterial,
      pillar: pillarMaterial,
      crate: crateMaterial,
      bone: boneMaterial,
      rune: runeMaterial,
      cliff: cliffMaterial,
      blood: bloodMaterial,
      device: deviceMaterial,
      deviceBase: deviceBaseMaterial,
      occluderPillarA,
      occluderPillarB,
      occluderTree,
    };
  }

  private nextTileName(counter: TileCounter, prefix: string): string {
    const id = counter.value++;
    return `${prefix}.${id}`;
  }

  private createFloorTile(
    scene: Scene,
    materials: HideoutMaterials,
    name: string,
    x: number,
    z: number,
    topHeight: number,
    tileSize: number,
    tileThickness: number,
    broken: boolean = false
  ): Mesh {
    const mesh = MeshBuilder.CreateBox(
      name,
      { width: tileSize, depth: tileSize, height: tileThickness },
      scene
    );
    mesh.position.set(x, topHeight - tileThickness / 2, z);
    mesh.material = broken ? materials.floorBroken : materials.floor;
    mesh.receiveShadows = true;
    mesh.isPickable = false;
    return mesh;
  }

  private createWallSegment(
    scene: Scene,
    name: string,
    width: number,
    height: number,
    depth: number,
    position: Vector3,
    material: StandardMaterial
  ): Mesh {
    const mesh = MeshBuilder.CreateBox(name, { width, height, depth }, scene);
    mesh.position.copyFrom(position);
    mesh.material = material;
    mesh.receiveShadows = true;
    mesh.isPickable = false;
    return mesh;
  }

  private buildPlatform(
    scene: Scene,
    materials: HideoutMaterials,
    tileSize: number,
    tileThickness: number,
    tileCounter: TileCounter
  ): PlatformLayout {
    const cols = 5;
    const rows = 4;
    const center = new Vector3(0, 0, -10);
    const frontZ = center.z + ((rows - 1) / 2) * tileSize;
    const backZ = center.z - ((rows - 1) / 2) * tileSize;
    const halfWidth = (cols * tileSize) / 2;
    const depth = rows * tileSize;

    this.platformHeight = 1.2;

    for (let row = 0; row < rows; row++) {
      const z = center.z + (row - (rows - 1) / 2) * tileSize;
      for (let col = 0; col < cols; col++) {
        const x = center.x + (col - (cols - 1) / 2) * tileSize;
        const name = this.nextTileName(tileCounter, "hideout.platform.tile");
        this.createFloorTile(scene, materials, name, x, z, this.platformHeight, tileSize, tileThickness);
      }
    }

    const wallHeight = 1.4;
    const wallThickness = 0.6;

    const backWall = this.createWallSegment(
      scene,
      "hideout.platformWall.back",
      cols * tileSize + 0.6,
      wallHeight,
      wallThickness,
      new Vector3(center.x, this.platformHeight + wallHeight / 2, backZ - tileSize / 2 - wallThickness / 2),
      materials.wall
    );
    this.addCollider(new Vector3(center.x, 0, backWall.position.z), cols * tileSize + 0.6, wallThickness);

    const leftWall = this.createWallSegment(
      scene,
      "hideout.platformWall.left",
      wallThickness,
      wallHeight,
      depth,
      new Vector3(center.x - halfWidth - wallThickness / 2, this.platformHeight + wallHeight / 2, center.z),
      materials.wall
    );
    this.addCollider(new Vector3(leftWall.position.x, 0, center.z), wallThickness, depth);

    const rightWall = this.createWallSegment(
      scene,
      "hideout.platformWall.right",
      wallThickness,
      wallHeight,
      depth,
      new Vector3(center.x + halfWidth + wallThickness / 2, this.platformHeight + wallHeight / 2, center.z),
      materials.wall
    );
    this.addCollider(new Vector3(rightWall.position.x, 0, center.z), wallThickness, depth);

    const walkwayGapWidth = tileSize * 2;
    const sideSpan = Math.max(0, cols * tileSize - walkwayGapWidth);
    if (sideSpan > 0.1) {
      const sideWidth = sideSpan / 2;
      const frontZWithBuffer = frontZ + tileSize / 2;
      const leftFront = this.createWallSegment(
        scene,
        "hideout.platformWall.front.left",
        sideWidth,
        wallHeight,
        wallThickness,
        new Vector3(-walkwayGapWidth / 2 - sideWidth / 2, this.platformHeight + wallHeight / 2, frontZWithBuffer),
        materials.wall
      );
      this.addCollider(new Vector3(leftFront.position.x, 0, frontZWithBuffer), sideWidth, wallThickness);

      const rightFront = this.createWallSegment(
        scene,
        "hideout.platformWall.front.right",
        sideWidth,
        wallHeight,
        wallThickness,
        new Vector3(walkwayGapWidth / 2 + sideWidth / 2, this.platformHeight + wallHeight / 2, frontZWithBuffer),
        materials.wall
      );
      this.addCollider(new Vector3(rightFront.position.x, 0, frontZWithBuffer), sideWidth, wallThickness);
    }

    const pillarPositions = [
      new Vector3(center.x - halfWidth + 0.7, this.platformHeight + 1.9, backZ + 0.8),
      new Vector3(center.x + halfWidth - 0.7, this.platformHeight + 1.9, backZ + 0.8),
      new Vector3(center.x - halfWidth + 0.7, this.platformHeight + 1.9, frontZ - 0.8),
      new Vector3(center.x + halfWidth - 0.7, this.platformHeight + 1.9, frontZ - 0.8),
    ];
    pillarPositions.forEach((position, index) => {
      const pillar = MeshBuilder.CreateCylinder(
        `hideout.platformPillar.${index}`,
        { diameter: 0.9, height: 3.2 },
        scene
      );
      pillar.position.copyFrom(position);
      pillar.material = materials.pillar;
      pillar.isPickable = false;
      pillar.receiveShadows = true;
    });

    return {
      center,
      frontZ,
      backZ,
      halfWidth,
      depth,
      cols,
      rows,
      tileSize,
    };
  }

  private buildRamp(
    scene: Scene,
    materials: HideoutMaterials,
    platform: PlatformLayout,
    tileSize: number,
    tileThickness: number,
    tileCounter: TileCounter
  ): RampLayout {
    const rampSegments = 3;
    const zPositions: number[] = [];
    for (let i = 0; i < rampSegments; i++) {
      zPositions.push(platform.frontZ + tileSize * (i + 1));
    }

    const startZ = platform.frontZ + tileSize * 0.25;
    const endZ = zPositions[zPositions.length - 1];
    const halfWidth = tileSize;

    this.rampStartZ = startZ;
    this.rampEndZ = endZ;
    this.rampHalfWidth = halfWidth;

    const offsetsX = [-tileSize / 2, tileSize / 2];
    for (const zPos of zPositions) {
      for (const offsetX of offsetsX) {
        const height = this.sampleHeight(new Vector3(offsetX, 0, zPos));
        const tileName = this.nextTileName(tileCounter, "hideout.ramp.tile");
        this.createFloorTile(scene, materials, tileName, offsetX, zPos, height, tileSize, tileThickness);
      }
    }

    const railHeight = 0.9;
    const railThickness = 0.6;
    for (const zPos of zPositions) {
      const walkwayHeight = this.sampleHeight(new Vector3(0, 0, zPos));
      const leftRail = this.createWallSegment(
        scene,
        `hideout.rampRail.left.${zPos.toFixed(2)}`,
        railThickness,
        railHeight,
        tileSize,
        new Vector3(-halfWidth - railThickness / 2, walkwayHeight + railHeight / 2, zPos),
        materials.railing
      );
      const rightRail = this.createWallSegment(
        scene,
        `hideout.rampRail.right.${zPos.toFixed(2)}`,
        railThickness,
        railHeight,
        tileSize,
        new Vector3(halfWidth + railThickness / 2, walkwayHeight + railHeight / 2, zPos),
        materials.railing
      );
      this.addCollider(new Vector3(leftRail.position.x, 0, zPos), railThickness, tileSize);
      this.addCollider(new Vector3(rightRail.position.x, 0, zPos), railThickness, tileSize);
    }

    return {
      startZ,
      endZ,
      halfWidth,
      zPositions,
    };
  }

  private buildLowerArena(
    scene: Scene,
    materials: HideoutMaterials,
    tileSize: number,
    tileThickness: number,
    ramp: RampLayout,
    tileCounter: TileCounter
  ): LowerArenaLayout {
    const cols = 7;
    const rows = 6;
    const frontZ = ramp.endZ + tileSize * 0.5;
    const centerZ = frontZ + ((rows - 1) / 2) * tileSize;
    const halfWidth = ((cols - 1) / 2) * tileSize;
    const width = cols * tileSize;
    const depth = rows * tileSize;

    for (let row = 0; row < rows; row++) {
      const z = frontZ + row * tileSize;
      for (let col = 0; col < cols; col++) {
        const x = (col - (cols - 1) / 2) * tileSize;
        const broken = (row + col) % 3 === 0;
        const tileName = this.nextTileName(tileCounter, "hideout.lower.tile");
        this.createFloorTile(scene, materials, tileName, x, z, 0, tileSize, tileThickness, broken);
      }
    }

    this.spawnArea = {
      minX: -halfWidth + tileSize * 0.5,
      maxX: halfWidth - tileSize * 0.5,
      minZ: frontZ + tileSize * 0.5,
      maxZ: frontZ + (rows - 1) * tileSize - tileSize * 0.5,
    };

    const wallHeight = 2.8;
    const wallThickness = 0.8;
    const depthWithMargin = depth + tileSize;
    const widthWithMargin = width + tileSize;

    const leftWall = this.createWallSegment(
      scene,
      "hideout.lowerWall.left",
      wallThickness,
      wallHeight,
      depthWithMargin,
      new Vector3(-halfWidth - wallThickness / 2, wallHeight / 2, centerZ),
      materials.cliff
    );
    this.addCollider(new Vector3(leftWall.position.x, 0, centerZ), wallThickness, depthWithMargin);

    const rightWall = this.createWallSegment(
      scene,
      "hideout.lowerWall.right",
      wallThickness,
      wallHeight,
      depthWithMargin,
      new Vector3(halfWidth + wallThickness / 2, wallHeight / 2, centerZ),
      materials.cliff
    );
    this.addCollider(new Vector3(rightWall.position.x, 0, centerZ), wallThickness, depthWithMargin);

    const backWall = this.createWallSegment(
      scene,
      "hideout.lowerWall.back",
      widthWithMargin,
      wallHeight,
      wallThickness,
      new Vector3(0, wallHeight / 2, frontZ + rows * tileSize + wallThickness / 2),
      materials.cliff
    );
    this.addCollider(new Vector3(0, 0, backWall.position.z), widthWithMargin, wallThickness);

    const cliffEdge = this.createWallSegment(
      scene,
      "hideout.lowerCliffEdge",
      widthWithMargin,
      2.2,
      0.6,
      new Vector3(0, 1.1, backWall.position.z + 1.2),
      materials.cliff
    );
    this.addCollider(new Vector3(0, 0, cliffEdge.position.z), widthWithMargin, 0.6);

    const dropGround = MeshBuilder.CreateGround(
      "hideout.dropGround",
      { width: widthWithMargin * 1.2, height: depthWithMargin * 1.4 },
      scene
    );
    dropGround.position = new Vector3(0, -3.2, cliffEdge.position.z + 6);
    dropGround.material = materials.floor;
    dropGround.isPickable = false;
    dropGround.receiveShadows = true;

    const distantRock1 = MeshBuilder.CreateBox(
      "hideout.distantRock1",
      { width: 4.5, height: 2.8, depth: 3.6 },
      scene
    );
    distantRock1.position = new Vector3(-5, -1.6, cliffEdge.position.z + 5.5);
    distantRock1.material = materials.cliff;
    distantRock1.isPickable = false;
    distantRock1.receiveShadows = true;

    const distantRock2 = MeshBuilder.CreateBox(
      "hideout.distantRock2",
      { width: 3.6, height: 2.2, depth: 4.2 },
      scene
    );
    distantRock2.position = new Vector3(4.4, -1.2, cliffEdge.position.z + 7.2);
    distantRock2.material = materials.cliff;
    distantRock2.isPickable = false;
    distantRock2.receiveShadows = true;

    const runeCircle = MeshBuilder.CreateDisc("hideout.runeCircle", { radius: 1.6, tessellation: 48 }, scene);
    runeCircle.rotation.x = Math.PI / 2;
    runeCircle.position = new Vector3(0, 0.04, frontZ + tileSize * 2);
    runeCircle.material = materials.rune;
    runeCircle.isPickable = false;

    const bonePilePositions = [
      new Vector3(-3.6, 0.25, frontZ + tileSize * 1.4),
      new Vector3(3.4, 0.25, frontZ + tileSize * 3.2),
    ];
    bonePilePositions.forEach((position, index) => {
      const pile = MeshBuilder.CreateCylinder(
        `hideout.bonePile.${index}`,
        { height: 0.6, diameterTop: 1.2, diameterBottom: 1.8, tessellation: 20 },
        scene
      );
      pile.position.copyFrom(position);
      pile.material = materials.bone;
      pile.rotation.y = index === 0 ? 0.3 : -0.45;
      pile.isPickable = false;
    });

    const crate = MeshBuilder.CreateBox("hideout.crate", { size: 1.4 }, scene);
    crate.position = new Vector3(-5.2, 0.7, frontZ + tileSize * 2.4);
    crate.material = materials.crate;
    crate.rotation.y = Math.PI / 6;
    crate.scaling = new Vector3(1.2, 1.1, 1.2);
    crate.isPickable = false;
    crate.receiveShadows = true;

    const bloodDecal = MeshBuilder.CreateGround(
      "hideout.bloodDecal",
      { width: tileSize * 0.9, height: tileSize * 0.6 },
      scene
    );
    bloodDecal.position = new Vector3(2.6, 0.02, frontZ + tileSize * 1.2);
    bloodDecal.material = materials.blood;
    bloodDecal.isPickable = false;
    bloodDecal.receiveShadows = false;

    return {
      frontZ,
      centerZ,
      halfWidth,
      width,
      depth,
    };
  }

  private placeDungeonDevice(scene: Scene, materials: HideoutMaterials, platform: PlatformLayout): void {
    this.dungeonDevice = MeshBuilder.CreateBox(
      "hideout.dungeonDevice",
      { width: 1.6, height: 2.4, depth: 1.6 },
      scene
    );
    this.dungeonDevice.position.set(
      platform.center.x - platform.halfWidth + platform.tileSize * 0.9,
      this.platformHeight + 1.2,
      platform.backZ + platform.tileSize * 0.9
    );
    this.dungeonDevice.material = materials.device;
    this.dungeonDevice.isPickable = true;

    const deviceBase = MeshBuilder.CreateCylinder(
      "hideout.deviceBase",
      { diameter: 2.2, height: 0.3 },
      scene
    );
    deviceBase.position.set(
      this.dungeonDevice.position.x,
      this.platformHeight + 0.15,
      this.dungeonDevice.position.z
    );
    deviceBase.material = materials.deviceBase;
    deviceBase.isPickable = false;
  }

  private placeOccluders(scene: Scene, materials: HideoutMaterials, platform: PlatformLayout): void {
    const occluderPillar = MeshBuilder.CreateCylinder(
      "hideout.occluder.pillar",
      { height: 5.4, diameter: 1.2 },
      scene
    );
    occluderPillar.position = new Vector3(-3.8, this.platformHeight + 2.7, platform.center.z - 2.4);
    occluderPillar.material = materials.occluderPillarA;
    occluderPillar.isPickable = true;
    this.registerOccluder(occluderPillar, materials.occluderPillarA);

    const occluderPillar2 = MeshBuilder.CreateCylinder(
      "hideout.occluder.pillar2",
      { height: 4.8, diameter: 1 },
      scene
    );
    occluderPillar2.position = new Vector3(2.6, this.platformHeight + 2.4, platform.center.z - 4.4);
    occluderPillar2.material = materials.occluderPillarB;
    occluderPillar2.isPickable = true;
    this.registerOccluder(occluderPillar2, materials.occluderPillarB);

    const treeTrunk = MeshBuilder.CreateCylinder(
      "hideout.occluder.treeTrunk",
      { height: 6, diameterBottom: 0.7, diameterTop: 0.45 },
      scene
    );
    treeTrunk.position = new Vector3(1.2, this.platformHeight + 3, platform.center.z - 6.2);
    treeTrunk.material = materials.occluderTree;

    const treeBranchA = MeshBuilder.CreateCylinder(
      "hideout.occluder.treeBranchA",
      { height: 2.4, diameter: 0.3 },
      scene
    );
    treeBranchA.material = materials.occluderTree;
    treeBranchA.rotation.z = Math.PI / 3;
    const branchAPosition = treeTrunk.position.clone();
    branchAPosition.addInPlace(new Vector3(0.8, 1.4, 0.2));
    treeBranchA.position.copyFrom(branchAPosition);

    const treeBranchB = MeshBuilder.CreateCylinder(
      "hideout.occluder.treeBranchB",
      { height: 2.1, diameter: 0.26 },
      scene
    );
    treeBranchB.material = materials.occluderTree;
    treeBranchB.rotation.x = -Math.PI / 3;
    const branchBPosition = treeTrunk.position.clone();
    branchBPosition.addInPlace(new Vector3(-0.6, 1.1, -0.3));
    treeBranchB.position.copyFrom(branchBPosition);

    const deadTree = Mesh.MergeMeshes([treeTrunk, treeBranchA, treeBranchB], true, true, undefined, false, true);
    if (deadTree) {
      deadTree.name = "hideout.occluder.tree";
      deadTree.material = materials.occluderTree;
      deadTree.isPickable = true;
      this.registerOccluder(deadTree as Mesh, materials.occluderTree);
    }
  }

  private async spawnPlayer(): Promise<void> {
    if (!this.scene || !this.input) {
      return;
    }

    try {
      this.player = await Player.createAsync(this.scene, this.input);
    } catch (error) {
      console.error("[QA] Hideout player create failed, using placeholder mesh.", error);
      const placeholder = MeshBuilder.CreateBox("hideout.playerPlaceholder", { size: 1.4 }, this.scene);
      placeholder.position.y = 1;
      this.player = Player.createPlaceholder(this.scene, placeholder, this.input);
    }

    const spawnPosition = new Vector3(0, this.platformHeight, -10);
    spawnPosition.y = this.sampleHeight(spawnPosition);
    const spawnFacing = 0;

    this.player.syncFromSave();

    // If player was dead (from dungeon death), respawn them
    if (this.player.isDead()) {
      this.player.respawn();
    }

    this.player.setSpawnPoint(spawnPosition, spawnFacing);
    this.player.teleportToSpawn();
    this.player.setCollidersProvider(() => this.colliders);

    this.cameraRig = new CameraRig(this.scene, this.player.getMesh());
    this.cameraRig.update();
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

  private isPlayerNearDevice(): boolean {
    if (!this.player || !this.dungeonDevice) {
      return false;
    }

    const playerPos = this.player.getPosition();
    const distanceSq = Vector3.DistanceSquared(playerPos, this.dungeonDevice.position);
    return distanceSq <= this.deviceInteractDistanceSq;
  }

  private getRandomSpawnPosition(): Vector3 {
    const area = this.spawnArea;
    const x = this.randomInRange(area.minX, area.maxX);
    const z = this.randomInRange(area.minZ, area.maxZ);
    const position = new Vector3(x, 0, z);
    position.y = this.sampleHeight(position);
    return position;
  }

  private tryEnterDungeon(): void {
    if (!this.player || !this.input || !this.dungeonDevice) {
      return;
    }

    if (this.transitionRequested || this.interactCooldown > 0) {
      return;
    }

    if (!this.isPlayerNearDevice()) {
      return;
    }

    this.transitionRequested = true;
    this.interactCooldown = 0.25;
    console.log("[QA] Entering dungeon from hideout");
    void this.sceneManager
      .goToDungeon()
      .catch((error) => {
        console.error("[QA] Failed to load dungeon from hideout", error);
        this.transitionRequested = false;
      });
  }
}
