import {
  Color3,
  Color4,
  DirectionalLight,
  Engine,
  HemisphericLight,
  MeshBuilder,
  Scene,
  StandardMaterial,
  Vector3,
} from "babylonjs";
import { Input } from "../core/Input";
import type { SceneBase } from "./SceneBase";
import { Player } from "../gameplay/Player";
import { CameraRig } from "../visuals/CameraRig";

/**
 * Dungeon scene placeholder responsible for player control and camera setup.
 */
export class DungeonScene implements SceneBase {
  private scene: Scene | null = null;
  private input: Input | null = null;
  private player: Player | null = null;
  private cameraRig: CameraRig | null = null;

  // TODO: Populate the dungeon with enemies, loot, and interactions in future milestones.

  /**
   * Create Babylon entities for the dungeon scene.
   */
  async load(engine: Engine): Promise<void> {
    this.scene = new Scene(engine);
    this.scene.ambientColor = new Color3(0.3, 0.3, 0.3);
    this.scene.clearColor = new Color4(0.03, 0.03, 0.035, 1);

    const hemiLight: HemisphericLight = new HemisphericLight("hemiLight", new Vector3(0, 1, 0), this.scene);
    hemiLight.intensity = 1.2;
    hemiLight.specular = Color3.Black();

    const directionalLight: DirectionalLight = new DirectionalLight(
      "mainDirectionalLight",
      new Vector3(-0.6, -1.2, 0.5).normalize(),
      this.scene
    );
    directionalLight.intensity = 1.1;
    directionalLight.position = new Vector3(10, 20, -10);

    const environment = this.scene.createDefaultEnvironment({
      createGround: false,
      createSkybox: false,
    });
    if (environment?.skyboxTexture) {
      this.scene.environmentTexture = environment.skyboxTexture;
    }
    environment?.ground?.dispose();
    environment?.skybox?.dispose();

    const groundMaterial = new StandardMaterial("groundMaterial", this.scene);
    groundMaterial.diffuseColor = new Color3(0.16, 0.16, 0.18);

    const ground = MeshBuilder.CreateGround("ground", { width: 120, height: 120 }, this.scene);
    ground.material = groundMaterial;
    ground.receiveShadows = true;

    this.input = new Input();

    try {
      this.player = await Player.createAsync(this.scene, this.input);
    } catch (error) {
      console.error("[QA] Player create failed, using placeholder mesh.", error);
      const placeholder = MeshBuilder.CreateBox("player-placeholder", { size: 1.4 }, this.scene);
      placeholder.position.y = 1;
      this.player = Player.createPlaceholder(this.scene, placeholder, this.input);
    }

    this.cameraRig = new CameraRig(this.scene, this.player.getMesh());
    this.cameraRig.update();

    console.log("[QA] DungeonScene loaded without throwing");
  }

  update(deltaTime: number): void {
    if (!this.scene || !this.input || !this.player || !this.cameraRig) {
      return;
    }

    this.player.update(deltaTime);
    this.cameraRig.update();
  }

  getScene(): Scene {
    if (!this.scene) {
      throw new Error("DungeonScene has not been loaded yet.");
    }

    return this.scene;
  }

  dispose(): void {
    this.input?.dispose();
    this.cameraRig?.dispose();
    this.scene?.dispose();
    this.scene = null;
    this.input = null;
    this.player = null;
    this.cameraRig = null;
  }

  // TODO: Spawn enemies, integrate CombatSystem, and drop loot once those systems are ready.
  // TODO: Award experience to the PlayerProfile and persist data using the SaveService.
}
