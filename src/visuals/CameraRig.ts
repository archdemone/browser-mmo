import { ArcRotateCamera, TransformNode, Vector3 } from "babylonjs";

/**
 * Maintains an isometric follow camera rig locked to the player.
 */
export class CameraRig {
  private readonly camera: ArcRotateCamera;
  private readonly target: TransformNode;
  private readonly alpha: number;
  private readonly beta: number;
  private readonly radius: number;
  private readonly targetOffset: Vector3;

  constructor(camera: ArcRotateCamera, target: TransformNode) {
    this.camera = camera;
    this.target = target;
    this.alpha = Math.PI / 4;
    this.beta = Math.PI / 3;
    this.radius = 15;
    this.targetOffset = new Vector3(0, 0, 0);

    this.camera.lowerAlphaLimit = this.alpha;
    this.camera.upperAlphaLimit = this.alpha;
    this.camera.lowerBetaLimit = this.beta;
    this.camera.upperBetaLimit = this.beta;
    this.camera.lowerRadiusLimit = this.radius;
    this.camera.upperRadiusLimit = this.radius;
    this.camera.inputs.clear();
  }

  /**
   * Update the camera to follow the player each frame.
   */
  update(): void {
    const playerPosition: Vector3 = this.target.getAbsolutePosition().add(this.targetOffset);
    this.camera.alpha = this.alpha;
    this.camera.beta = this.beta;
    this.camera.radius = this.radius;
    this.camera.setTarget(playerPosition);
  }

  // TODO: Add camera shake effects and smooth dampening/lerp options for future polish.
}
