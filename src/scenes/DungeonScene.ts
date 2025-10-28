import {
  Color3,
  Color4,
  DirectionalLight,
  Engine,
  HemisphericLight,
  Mesh,
  MeshBuilder,
  Scene,
  StandardMaterial,
  Vector3,
} from "babylonjs";
import type { SceneBase } from "./SceneBase";
import type { SceneManager } from "../core/SceneManager";
import { Input } from "../core/Input";
import { Player, type PlayerCollider } from "../gameplay/Player";
import { Enemy } from "../gameplay/Enemy";
import { CombatSystem } from "../gameplay/CombatSystem";
import { CameraRig } from "../visuals/CameraRig";
import { SaveService } from "../state/SaveService";
import { HudUI, type HudState } from "../ui/HudUI";

interface SpawnZone {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export class DungeonScene implements SceneBase {
  private readonly sceneManager: SceneManager;
  private scene: Scene | null = null;
  private input: Input | null = null;
  private player: Player | null = null;
  private cameraRig: CameraRig | null = null;
  private combatSystem: CombatSystem | null = null;
  private exitPortal: Mesh | null = null;
  private enemies: Enemy[] = [];
  private colliders: PlayerCollider[] = [];
  private spawnZones: SpawnZone[] = [];
  private startSpawn: Vector3 = Vector3.Zero();
  private debugSpawnCooldown: number = 0;
  private transitionRequested: boolean = false;
  private deathHandled: boolean = false;
  private readonly exitPortalDistanceSq: number = 4;
  private readonly maxStamina: number = 100;

  constructor(sceneManager: SceneManager) {
    this.sceneManager = sceneManager;
  }

  async load(engine: Engine): Promise<void> {
    this.scene = new Scene(engine);
    this.scene.ambientColor = new Color3(0.2, 0.2, 0.24);
    this.scene.clearColor = new Color4(0.01, 0.01, 0.015, 1);

    const hemi = new HemisphericLight("dungeon.hemi", new Vector3(0, 1, 0), this.scene);
    hemi.intensity = 0.9;
    hemi.specular = Color3.Black();

    const dirLight = new DirectionalLight(
      "dungeon.dir",
      new Vector3(-0.6, -1, 0.4).normalize(),
      this.scene
    );
    dirLight.intensity = 0.8;

    this.input = new Input();
    this.combatSystem = new CombatSystem();
    this.colliders = [];
    this.spawnZones = [];
    this.transitionRequested = false;
    this.deathHandled = false;
    this.debugSpawnCooldown = 0;

    this.buildDungeonGeometry();
    await this.spawnPlayer();
    await this.spawnInitialEnemies(6);
    HudUI.init();
    HudUI.onClickAttack(() => {
      this.input?.triggerVirtualAttack();
    });
    HudUI.onClickDodge(() => {
      this.input?.triggerVirtualDodge();
    });
    HudUI.onClickEnterDungeon(null);

    console.log("[QA] Dungeon generated");
  }

  update(deltaTime: number): void {
    if (!this.scene || !this.input || !this.player || !this.cameraRig || !this.combatSystem) {
      return;
    }

    this.player.update(deltaTime);
    const playerDead = this.player.isDead();

    if (playerDead) {
      this.handlePlayerDeath();
    } else {
      for (const enemy of this.enemies) {
        try {
          enemy.update(deltaTime, this.player);
        } catch (error) {
          console.error("[QA] Enemy update failed", error);
        }
      }

      if (this.player.consumeAttackTrigger()) {
        this.combatSystem.playerAttack(this.player, this.enemies);
      }

      this.cleanupDeadEnemies();

      this.debugSpawnCooldown = Math.max(0, this.debugSpawnCooldown - deltaTime);
      if (this.input.consumeSpawnEnemy() && this.debugSpawnCooldown <= 0) {
        this.debugSpawnCooldown = 0.4;
        void this.spawnEnemyAt(this.getRandomSpawnPosition());
      }

      this.checkExitPortal();
    }

    this.updateHud(playerDead);
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
        console.warn("[QA] Failed to dispose dungeon enemy", error);
      }
    }
    this.enemies = [];
    Enemy.clearVisualPool();

    this.player?.setCollidersProvider(null);
    this.input?.dispose();
    this.cameraRig?.dispose();
    this.scene?.dispose();

    this.scene = null;
    this.input = null;
    this.player = null;
    this.cameraRig = null;
    this.combatSystem = null;
    this.exitPortal = null;
    this.colliders = [];
    this.spawnZones = [];
    this.transitionRequested = false;
    this.deathHandled = false;
  }

  private buildDungeonGeometry(): void {
    if (!this.scene) {
      return;
    }

    const startRoomWidth = 14;
    const startRoomDepth = 14;
    const corridorWidth = 6;
    const corridorLength = 26;
    const endRoomWidth = 16;
    const endRoomDepth = 14;
    const wallThickness = 0.8;
    const wallHeight = 4.5;

    const startRoomHalfWidth = startRoomWidth / 2;
    const startRoomHalfDepth = startRoomDepth / 2;
    const corridorHalfWidth = corridorWidth / 2;
    const corridorHalfLength = corridorLength / 2;
    const endRoomHalfWidth = endRoomWidth / 2;
    const endRoomHalfDepth = endRoomDepth / 2;

    const startMinZ = -startRoomHalfDepth;
    const startMaxZ = startRoomHalfDepth;
    const corridorMinZ = startMaxZ;
    const corridorMaxZ = corridorMinZ + corridorLength;
    const corridorCenterZ = corridorMinZ + corridorHalfLength;
    const endMinZ = corridorMaxZ;
    const endMaxZ = endMinZ + endRoomDepth;
    const endCenterZ = endMinZ + endRoomHalfDepth;

    const floorMaterial = new StandardMaterial("dungeon.floorMat", this.scene);
    floorMaterial.diffuseColor = new Color3(0.12, 0.12, 0.15);
    floorMaterial.specularColor = Color3.Black();

    const startFloor = MeshBuilder.CreateGround(
      "dungeon.floor.start",
      { width: startRoomWidth, height: startRoomDepth },
      this.scene
    );
    startFloor.material = floorMaterial;
    startFloor.position.z = (startMinZ + startMaxZ) / 2;

    const corridorFloor = MeshBuilder.CreateGround(
      "dungeon.floor.corridor",
      { width: corridorWidth, height: corridorLength },
      this.scene
    );
    corridorFloor.material = floorMaterial;
    corridorFloor.position.z = corridorCenterZ;

    const endFloor = MeshBuilder.CreateGround(
      "dungeon.floor.end",
      { width: endRoomWidth, height: endRoomDepth },
      this.scene
    );
    endFloor.material = floorMaterial;
    endFloor.position.z = endCenterZ;

    const wallMaterial = new StandardMaterial("dungeon.wallMat", this.scene);
    wallMaterial.diffuseColor = new Color3(0.18, 0.18, 0.24);
    wallMaterial.specularColor = new Color3(0.05, 0.05, 0.05);

    // Start room walls
    this.createWall(
      "dungeon.wall.start.south",
      new Vector3(0, wallHeight / 2, startMinZ - wallThickness / 2),
      startRoomWidth,
      wallThickness,
      wallHeight,
      wallMaterial
    );

    this.createWall(
      "dungeon.wall.start.west",
      new Vector3(-startRoomHalfWidth - wallThickness / 2, wallHeight / 2, (startMinZ + startMaxZ) / 2),
      wallThickness,
      startRoomDepth,
      wallHeight,
      wallMaterial
    );

    this.createWall(
      "dungeon.wall.start.east",
      new Vector3(startRoomHalfWidth + wallThickness / 2, wallHeight / 2, (startMinZ + startMaxZ) / 2),
      wallThickness,
      startRoomDepth,
      wallHeight,
      wallMaterial
    );

    const northSegmentWidth = startRoomHalfWidth - corridorHalfWidth;
    if (northSegmentWidth > 0.1) {
      this.createWall(
        "dungeon.wall.start.north.left",
        new Vector3(
          -corridorHalfWidth - northSegmentWidth / 2,
          wallHeight / 2,
          startMaxZ + wallThickness / 2
        ),
        northSegmentWidth,
        wallThickness,
        wallHeight,
        wallMaterial
      );

      this.createWall(
        "dungeon.wall.start.north.right",
        new Vector3(
          corridorHalfWidth + northSegmentWidth / 2,
          wallHeight / 2,
          startMaxZ + wallThickness / 2
        ),
        northSegmentWidth,
        wallThickness,
        wallHeight,
        wallMaterial
      );
    }

    // Corridor walls
    this.createWall(
      "dungeon.wall.corridor.west",
      new Vector3(
        -corridorHalfWidth - wallThickness / 2,
        wallHeight / 2,
        corridorCenterZ
      ),
      wallThickness,
      corridorLength,
      wallHeight,
      wallMaterial
    );

    this.createWall(
      "dungeon.wall.corridor.east",
      new Vector3(
        corridorHalfWidth + wallThickness / 2,
        wallHeight / 2,
        corridorCenterZ
      ),
      wallThickness,
      corridorLength,
      wallHeight,
      wallMaterial
    );

    // End room walls
    this.createWall(
      "dungeon.wall.end.north",
      new Vector3(0, wallHeight / 2, endMaxZ + wallThickness / 2),
      endRoomWidth,
      wallThickness,
      wallHeight,
      wallMaterial
    );

    this.createWall(
      "dungeon.wall.end.west",
      new Vector3(-endRoomHalfWidth - wallThickness / 2, wallHeight / 2, endCenterZ),
      wallThickness,
      endRoomDepth,
      wallHeight,
      wallMaterial
    );

    this.createWall(
      "dungeon.wall.end.east",
      new Vector3(endRoomHalfWidth + wallThickness / 2, wallHeight / 2, endCenterZ),
      wallThickness,
      endRoomDepth,
      wallHeight,
      wallMaterial
    );

    const endSouthSegmentWidth = endRoomHalfWidth - corridorHalfWidth;
    if (endSouthSegmentWidth > 0.1) {
      this.createWall(
        "dungeon.wall.end.south.left",
        new Vector3(
          -corridorHalfWidth - endSouthSegmentWidth / 2,
          wallHeight / 2,
          endMinZ - wallThickness / 2
        ),
        endSouthSegmentWidth,
        wallThickness,
        wallHeight,
        wallMaterial
      );

      this.createWall(
        "dungeon.wall.end.south.right",
        new VectorVector3(
          corridorHalfWidth + endSouthSegmentWidth / 2,
          wallHeight / 2,
          endMinZ - wallThickness / 2
        ),
        endSouthSegmentWidth,
        wallThickness,
        wallHeight,
        wallMaterial
      );
    }

    // Exit portal
    const portalMaterial = new StandardMaterial("dungeon.portalMat", this.scene);
    portalMaterial.diffuseColor = new Color3(0.05, 0.18, 0.32);
    portalMaterial.emissiveColor = new Color3(0.2, 0.6, 0.9);
    portalMaterial.specularColor = Color3.Black();

    this.exitPortal = MeshBuilder.CreateCylinder(
      "dungeon.exitPortal",
      { diameter: 2.2, height: 0.3 },
      this.scene
    );
    this.exitPortal.position.set(0, 0.15, endMaxZ - 2);
    this.exitPortal.material = portalMaterial;

    const portalColumn = MeshBuilder.CreateCylinder(
      "dungeon.portalColumn",
      { diameter: 1.2, height: 2.8 },
      this.scene
    );
    portalColumn.position.set(this.exitPortal.position.x, 1.5, this.exitPortal.position.z);
    const columnMaterial = new StandardMaterial("dungeon.portalColumnMat", this.scene);
    columnMaterial.diffuseColor = new Color3(0.08, 0.2, 0.3);
    columnMaterial.emissiveColor = new Color3(0.12, 0.35, 0.6);
    portalColumn.material = columnMaterial;

    this.startSpawn = new Vector3(0, 0, startMinZ + 2.5);

    this.spawnZones = [
      {
        minX: -startRoomHalfWidth + 1,
        maxX: startRoomHalfWidth - 1,
        minZ: startMinZ + 1,
        maxZ: startMaxZ - 2,
      },
      {
        minX: -corridorHalfWidth + 0.6,
        maxX: corridorHalfWidth - 0.6,
        minZ: corridorMinZ + 1,
        maxZ: corridorMaxZ - 1,
      },
      {
        minX: -endRoomHalfWidth + 1,
        maxX: endRoomHalfWidth - 1,
        minZ: endMinZ + 1,
        maxZ: endMaxZ - 1,
      },
    ];
  }

  private async spawnPlayer(): Promise<void> {
    if (!this.scene || !this.input) {
      return;
    }

    try {
      this.player = await Player.createAsync(this.scene, this.input);
    } catch (error) {
      console.error("[QA] Dungeon player create failed, using placeholder mesh.", error);
      const placeholder = MeshBuilder.CreateBox("dungeon.playerPlaceholder", { size: 1.4 }, this.scene);
      placeholder.position.y = 1;
      this.player = Player.createPlaceholder(this.scene, placeholder, this.input);
    }

    const spawnPosition = this.startSpawn.clone();
    const spawnFacing = 0;

    this.player.syncFromSave();
    this.player.setSpawnPoint(spawnPosition, spawnFacing);
    this.player.teleportToSpawn();
    this.player.setCollidersProvider(() => this.colliders);

    this.cameraRig = new CameraRig(this.scene, this.player.getMesh());
    this.cameraRig.update();
  }

  private async spawnInitialEnemies(count: number): Promise<void> {
    if (!this.scene) {
      return;
    }

    const spawnPromises: Array<Promise<void>> = [];
    for (let i = 0; i < count; i++) {
      const position = this.getRandomSpawnPosition();
      spawnPromises.push(this.spawnEnemyAt(position));
    }

    await Promise.all(spawnPromises);
  }

  private async spawnEnemyAt(position: Vector3): Promise<void> {
    if (!this.scene) {
      return;
    }
    try {
      const enemy = await Enemy.create(this.scene, position);
      this.enemies.push(enemy);
    } catch (error) {
      console.error("[QA] Failed to spawn dungeon enemy", error);
    }
  }

  private getRandomSpawnPosition(): Vector3 {
    if (this.spawnZones.length === 0) {
      return this.startSpawn.clone();
    }

    const zone = this.spawnZones[Math.floor(Math.random() * this.spawnZones.length)];
    const x = this.randomInRange(zone.minX, zone.maxX);
    const z = this.randomInRange(zone.minZ, zone.maxZ);
    return new Vector3(x, 0, z);
  }

  private randomInRange(min: number, max: number): number {
    if (max <= min) {
      return min;
    }
    return min + Math.random() * (max - min);
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
          console.error("[QA] Failed to return to hideout from dungeon exit", error);
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
    console.log("[QA] Player died in dungeon, respawning in hideout");
    SaveService.resetHPFull();
    void this.sceneManager
      .goToHideout()
      .catch((error) => {
        console.error("[QA] Failed to transition to hideout after death", error);
        this.deathHandled = false;
        this.transitionRequested = false;
      });
  }

  private createWall(
    name: string,
    center: Vector3,
    width: number,
    depth: number,
    height: number,
    material: StandardMaterial
  ): void {
    if (!this.scene) {
      return;
    }
    const wall = MeshBuilder.CreateBox(
      name,
      { width, depth, height },
      this.scene
    );
    wall.position.copyFrom(center);
    wall.material = material;
    this.addCollider(center, width, depth);
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
      // TODO: Swap placeholder stamina for real dodge resource tracking when available.
      stamina: this.maxStamina,
      maxStamina: this.maxStamina,
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
}
