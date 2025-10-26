import {
  ArcRotateCamera,
  Color3,
  Color4,
  Engine,
  HemisphericLight,
  MeshBuilder,
  Scene,
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
    this.scene.clearColor = new Color4(0.02, 0.02, 0.02, 1);

    const light: HemisphericLight = new HemisphericLight("hemi", new Vector3(0, 1, 0), this.scene);
    light.intensity = 0.9;
    light.specular = Color3.Black();

    MeshBuilder.CreateGround("ground", { width: 50, height: 50 }, this.scene);

    this.input = new Input();
    this.player = await Player.createAsync(this.scene, this.input);

    const camera: ArcRotateCamera = new ArcRotateCamera(
      "isoCamera",
      Math.PI / 4,
      Math.PI / 3,
      20,
      new Vector3(0, 0, 0),
      this.scene,
      true
    );

    this.scene.activeCamera = camera;

    this.cameraRig = new CameraRig(camera, this.player.getMesh());
    this.cameraRig.update();
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
    this.scene?.dispose();
    this.scene = null;
    this.input = null;
    this.player = null;
    this.cameraRig = null;
  }

  // TODO: Spawn enemies, integrate CombatSystem, and drop loot once those systems are ready.
  // TODO: Award experience to the PlayerProfile and persist data using the SaveService.
}
