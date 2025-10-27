import { ArcRotateCamera, Scene, TransformNode, Vector3 } from "babylonjs";

/**
 * Maintains an isometric follow camera rig locked to the player.
 */
export class CameraRig {
  private readonly camera: ArcRotateCamera;
  private readonly scene: Scene;
  private target: TransformNode | null;
  private readonly alpha: number;
  private readonly beta: number;
  private readonly radius: number;
  private readonly targetOffset: Vector3;

  constructor(scene: Scene, target: TransformNode | null) {
    this.scene = scene;
    this.target = target ?? null;
    this.alpha = Math.PI / 4; // isometric-ish
    this.beta = Math.PI / 3;
    this.radius = 15;
    this.targetOffset = new Vector3(0, 0, 0);

    this.camera = new ArcRotateCamera("isoCamera", this.alpha, this.beta, this.radius, new Vector3(0, 0, 0), scene, true);
    this.camera.lowerAlphaLimit = this.alpha;
    this.camera.upperAlphaLimit = this.alpha;
    this.camera.lowerBetaLimit = this.beta;
    this.camera.upperBetaLimit = this.beta;
    this.camera.lowerRadiusLimit = this.radius;
    this.camera.upperRadiusLimit = this.radius;
    this.camera.inputs.clear();

    this.scene.activeCamera = this.camera;
    const canvas = this.scene.getEngine().getRenderingCanvas();
    if (canvas) {
      this.camera.attachControl(canvas, true);
    }
  }

  /**
   * Update the camera to follow the player each frame.
   */
  update(): void {
    if (!this.target) {
      return;
    }
    const playerPosition: Vector3 = this.target.getAbsolutePosition().add(this.targetOffset);
    this.camera.alpha = this.alpha;
    this.camera.beta = this.beta;
    this.camera.radius = this.radius;
    this.camera.setTarget(playerPosition);
  }

  setTarget(target: TransformNode | null): void {
    this.target = target;
  }

  // TODO: Add camera shake effects and smooth dampening/lerp options for future polish.
}
