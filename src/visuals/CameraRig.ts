import { ArcRotateCamera, Scene, TransformNode, Vector3 } from "babylonjs";

/**
 * Maintains an isometric follow camera rig locked to the player.
 */
export class CameraRig {
  private readonly scene: Scene;
  private readonly camera: ArcRotateCamera;
  private target: TransformNode | null;
  private readonly alpha: number;
  private readonly beta: number;
  private readonly radius: number;
  private readonly targetOffset: Vector3;

  constructor(scene: Scene, target: TransformNode | null) {
    this.scene = scene;
    this.target = target;
    this.alpha = Math.PI * 1.25;
    this.beta = 1.0;
    this.radius = 15;
    this.targetOffset = new Vector3(0, 1.6, 0);

    const initialTarget = target?.getAbsolutePosition() ?? Vector3.Zero();
    this.camera = new ArcRotateCamera("camera.arpg", this.alpha, this.beta, this.radius, initialTarget, scene);
    this.camera.lowerAlphaLimit = this.alpha;
    this.camera.upperAlphaLimit = this.alpha;
    this.camera.lowerBetaLimit = this.beta;
    this.camera.upperBetaLimit = this.beta;
    this.camera.lowerRadiusLimit = this.radius;
    this.camera.upperRadiusLimit = this.radius;
    this.camera.panningSensibility = 0;
    this.camera.useAutoRotationBehavior = false;
    this.camera.allowUpsideDown = false;

    const canvas = scene.getEngine().getRenderingCanvas();
    if (canvas) {
      this.camera.attachControl(canvas, true);
    } else {
      console.warn("[QA] CameraRig could not find rendering canvas to attach control.");
    }

    scene.activeCamera = this.camera;
  }

  /**
   * Update the camera to follow the player each frame.
   */
  update(): void {
    if (!this.target || this.target.isDisposed()) {
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

  dispose(): void {
    const canvas = this.scene.getEngine().getRenderingCanvas();
    if (canvas) {
      this.camera.detachControl();
    }
    this.camera.dispose();
    this.target = null;
  }

  // TODO: Add camera shake effects and smooth dampening/lerp options for future polish.
}
