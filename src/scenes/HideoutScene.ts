import {
  Color3,
  Color4,
  Engine,
  HemisphericLight,
  Mesh,
  MeshBuilder,
  Scene,
  StandardMaterial,
  Vector3,
} from "babylonjs";
import { Input } from "../core/Input";
import type { SceneBase } from "./SceneBase";
import { Player, type PlayerCollider } from "../gameplay/Player";
import { CameraRig } from "../visuals/CameraRig";
import type { SceneManager } from "../core/SceneManager";
import { HudUI, type HudState } from "../ui/HudUI";
import { SaveService } from "../state/SaveService";

export class HideoutScene implements SceneBase {
  private readonly sceneManager: SceneManager;
  private scene: Scene | null = null;
  private input: Input | null = null;
  private player: Player | null = null;
  private cameraRig: CameraRig | null = null;
  private dungeonDevice: Mesh | null = null;
  private colliders: PlayerCollider[] = [];
  private transitionRequested: boolean = false;
  private readonly deviceInteractDistanceSq: number = 4;
  private interactCooldown: number = 0;
  private readonly maxStamina: number = 100;

  constructor(sceneManager: SceneManager) {
    this.sceneManager = sceneManager;
  }

  async load(engine: Engine): Promise<void> {
    this.scene = new Scene(engine);
    this.scene.ambientColor = new Color3(0.25, 0.25, 0.3);
    this.scene.clearColor = new Color4(0.02, 0.02, 0.03, 1);

    const hemi = new HemisphericLight("hideout.hemi", new Vector3(0, 1, 0), this.scene);
    hemi.intensity = 1.15;
    hemi.specular = Color3.Black();

    this.input = new Input();
    this.buildHideoutGeometry();
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

    console.log("[QA] Hideout loaded");
  }

  update(deltaTime: number): void {
    if (!this.scene || !this.input || !this.player || !this.cameraRig) {
      return;
    }

    this.player.update(deltaTime);

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

  private buildHideoutGeometry(): void {
    if (!this.scene) {
      return;
    }

    this.colliders = [];

    const roomWidth = 18;
    const roomDepth = 24;
    const wallHeight = 4.2;
    const wallThickness = 0.8;

    const floorMaterial = new StandardMaterial("hideout.floorMat", this.scene);
    floorMaterial.diffuseColor = new Color3(0.16, 0.16, 0.2);
    floorMaterial.specularColor = Color3.Black();

    const floor = MeshBuilder.CreateGround(
      "hideout.floor",
      { width: roomWidth, height: roomDepth },
      this.scene
    );
    floor.material = floorMaterial;
    floor.receiveShadows = true;

    const wallMaterial = new StandardMaterial("hideout.wallMat", this.scene);
    wallMaterial.diffuseColor = new Color3(0.22, 0.22, 0.28);
    wallMaterial.specularColor = new Color3(0.05, 0.05, 0.05);

    const northWall = MeshBuilder.CreateBox(
      "hideout.wall.north",
      { width: roomWidth, height: wallHeight, depth: wallThickness },
      this.scene
    );
    northWall.position.set(0, wallHeight / 2, roomDepth / 2);
    northWall.material = wallMaterial;
    this.addCollider(northWall.position, roomWidth, wallThickness);

    const southWall = MeshBuilder.CreateBox(
      "hideout.wall.south",
      { width: roomWidth, height: wallHeight, depth: wallThickness },
      this.scene
    );
    southWall.position.set(0, wallHeight / 2, -roomDepth / 2);
    southWall.material = wallMaterial;
    this.addCollider(southWall.position, roomWidth, wallThickness);

    const eastWall = MeshBuilder.CreateBox(
      "hideout.wall.east",
      { width: wallThickness, height: wallHeight, depth: roomDepth },
      this.scene
    );
    eastWall.position.set(roomWidth / 2, wallHeight / 2, 0);
    eastWall.material = wallMaterial;
    this.addCollider(eastWall.position, wallThickness, roomDepth);

    const westWall = MeshBuilder.CreateBox(
      "hideout.wall.west",
      { width: wallThickness, height: wallHeight, depth: roomDepth },
      this.scene
    );
    westWall.position.set(-roomWidth / 2, wallHeight / 2, 0);
    westWall.material = wallMaterial;
    this.addCollider(westWall.position, wallThickness, roomDepth);

    const deviceMaterial = new StandardMaterial("hideout.deviceMat", this.scene);
    deviceMaterial.diffuseColor = new Color3(0.05, 0.12, 0.25);
    deviceMaterial.emissiveColor = new Color3(0.2, 0.5, 1.0);
    deviceMaterial.specularColor = Color3.Black();

    this.dungeonDevice = MeshBuilder.CreateBox(
      "hideout.dungeonDevice",
      { width: 1.6, height: 2.4, depth: 1.6 },
      this.scene
    );
    this.dungeonDevice.position.set(0, 1.2, roomDepth / 2 - 3);
    this.dungeonDevice.material = deviceMaterial;

    const deviceBase = MeshBuilder.CreateCylinder(
      "hideout.deviceBase",
      { diameter: 2.2, height: 0.3 },
      this.scene
    );
    deviceBase.position.set(this.dungeonDevice.position.x, 0.15, this.dungeonDevice.position.z);
    const baseMaterial = new StandardMaterial("hideout.deviceBaseMat", this.scene);
    baseMaterial.diffuseColor = new Color3(0.12, 0.12, 0.15);
    baseMaterial.specularColor = Color3.Black();
    deviceBase.material = baseMaterial;
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

    const spawnPosition = new Vector3(0, 0, -8);
    const spawnFacing = 0;

    this.player.syncFromSave();
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
