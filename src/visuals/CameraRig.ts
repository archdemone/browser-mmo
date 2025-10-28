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
  private readonly defaultRadius: number;
  private currentRadius: number;
  private targetRadius: number;
  private readonly minRadius: number;
  private readonly maxRadius: number;
  private readonly zoomSpeed: number;
  private readonly targetOffset: Vector3;
  private debugLogTimeRemaining: number = 0;

  constructor(scene: Scene, target: TransformNode | null) {
    this.scene = scene;
    this.target = target;
    this.alpha = Math.PI * 1.25;
    this.beta = 1.0;
    this.defaultRadius = 15;
    this.minRadius = 8;
    this.maxRadius = 25;
    this.zoomSpeed = 20; // Units per second
    this.currentRadius = this.defaultRadius;
    this.targetRadius = this.defaultRadius;
    this.targetOffset = new Vector3(0, 1.6, 0);

    const initialTarget = target?.getAbsolutePosition() ?? Vector3.Zero();
    this.camera = new ArcRotateCamera("camera.arpg", this.alpha, this.beta, this.currentRadius, initialTarget, scene);
    this.camera.lowerAlphaLimit = this.alpha;
    this.camera.upperAlphaLimit = this.alpha;
    this.camera.lowerBetaLimit = this.beta;
    this.camera.upperBetaLimit = this.beta;
    this.camera.lowerRadiusLimit = this.minRadius;
    this.camera.upperRadiusLimit = this.maxRadius;
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
  update(deltaTime?: number): void {
    if (!this.target || this.target.isDisposed()) {
      return;
    }

    // Smoothly interpolate towards target radius
    if (deltaTime !== undefined) {
      const delta = this.targetRadius - this.currentRadius;
      const maxDelta = this.zoomSpeed * deltaTime;
      if (Math.abs(delta) > maxDelta) {
        this.currentRadius += Math.sign(delta) * maxDelta;
      } else {
        this.currentRadius = this.targetRadius;
      }
    }

    const playerPosition = this.target.getAbsolutePosition().add(this.targetOffset);
    this.camera.alpha = this.alpha;
    this.camera.beta = this.beta;
    this.camera.radius = this.currentRadius;
    this.camera.setTarget(playerPosition);

    if (this.debugLogTimeRemaining > 0) {
      console.log(
        `[DBG] camera targeting (${playerPosition.x.toFixed(2)},${playerPosition.z.toFixed(
          2
        )}) camPos=(${this.camera.position.x.toFixed(2)},${this.camera.position.z.toFixed(2)})`
      );
      const elapsed = typeof deltaTime === "number" ? deltaTime : this.scene.getEngine().getDeltaTime() / 1000;
      this.debugLogTimeRemaining = Math.max(0, this.debugLogTimeRemaining - elapsed);
    }
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

  enableDebugLogging(seconds: number): void {
    this.debugLogTimeRemaining = Math.max(this.debugLogTimeRemaining, seconds);
  }

  /**
   * Zoom the camera by the specified delta amount.
   * Positive values zoom out, negative values zoom in.
   */
  zoomBy(delta: number): void {
    this.targetRadius = Math.max(this.minRadius, Math.min(this.maxRadius, this.targetRadius + delta));
  }

  /**
   * Set the camera zoom to a specific radius.
   */
  setZoom(radius: number): void {
    this.targetRadius = Math.max(this.minRadius, Math.min(this.maxRadius, radius));
  }

  /**
   * Reset the camera zoom to the default radius.
   */
  resetZoom(): void {
    this.targetRadius = this.defaultRadius;
  }

  /**
   * Get the current zoom level (0 = fully zoomed in, 1 = fully zoomed out).
   */
  getZoomLevel(): number {
    return (this.currentRadius - this.minRadius) / (this.maxRadius - this.minRadius);
  }

  // TODO: Add camera shake effects and smooth dampening/lerp options for future polish.
}
