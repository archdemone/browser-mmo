import { Scene, Vector3 } from "babylonjs";
import type { Camera, TransformNode } from "babylonjs";
import type { Input } from "../core/Input";
import { createPlayerCharacter } from "../visuals/CharacterFactory";
import { PlayerAnimator } from "../visuals/PlayerAnimator";

/**
 * Represents the controllable player character.
 */
export class Player {
  private readonly mesh: TransformNode;
  private readonly animator: PlayerAnimator;
  private readonly input: Input;
  private readonly walkSpeed: number;
  private readonly sprintSpeed: number;
  private readonly dodgeSpeed: number;
  private readonly dodgeDuration: number;
  private dodgeTimeRemaining: number;
  private readonly dodgeDirection: Vector3;
  private readonly lastMoveDirection: Vector3;

  private constructor(mesh: TransformNode, animator: PlayerAnimator, input: Input) {
    this.mesh = mesh;
    if (this.mesh.rotationQuaternion) {
      this.mesh.rotationQuaternion = null;
    }
    this.animator = animator;
    this.input = input;
    this.walkSpeed = 4;
    this.sprintSpeed = 7;
    this.dodgeSpeed = 14;
    this.dodgeDuration = 0.35;
    this.dodgeTimeRemaining = 0;
    this.dodgeDirection = new Vector3(0, 0, 1);
    this.lastMoveDirection = new Vector3(0, 0, 1);

    if (typeof window !== "undefined") {
      (window as unknown as { __qaPlayer?: Player }).__qaPlayer = this;
    }
  }

  /**
   * Asynchronously load the player mesh and animations.
   */
  static async createAsync(scene: Scene, input: Input): Promise<Player> {
    const { rootMesh, animator } = await createPlayerCharacter(scene);
    console.log("[Player] createAsync() complete - animator ready");
    return new Player(rootMesh, animator, input);
  }

  /**
   * Creates a placeholder player representation when the authored asset fails to load.
   */
  static createPlaceholder(_scene: Scene, mesh: TransformNode, input: Input): Player {
    return new Player(mesh, PlayerAnimator.createEmpty(), input);
  }

  /**
   * Update the player's position, facing, and animation state.
   */
  update(deltaTime: number): void {
    const moveAxis = this.input.getMoveAxis();
    const sprinting = this.input.isSprinting();
    const movementDirection = this.computeMovementDirection(moveAxis);
    const debugMoveDirection = movementDirection.clone();
    let speedThisFrame = 0;

    if (movementDirection.lengthSquared() > 0) {
      movementDirection.normalize();
      speedThisFrame = sprinting ? this.sprintSpeed : this.walkSpeed;
      const displacement = movementDirection.scale(speedThisFrame * deltaTime);
      this.mesh.position.addInPlace(displacement);
      this.lastMoveDirection.copyFrom(movementDirection);

      const facingAngle: number = Math.atan2(movementDirection.x, movementDirection.z);
      this.mesh.rotation.y = facingAngle;
    }

    if (this.dodgeTimeRemaining > 0) {
      const direction =
        this.dodgeDirection.lengthSquared() > 0
          ? this.dodgeDirection
          : this.lastMoveDirection.lengthSquared() > 0
          ? this.lastMoveDirection
          : this.getFacingDirection();
      const normalized = direction.clone().normalize();
      const displacement = normalized.scale(this.dodgeSpeed * deltaTime);
      this.mesh.position.addInPlace(displacement);
      this.dodgeTimeRemaining = Math.max(0, this.dodgeTimeRemaining - deltaTime);
    }

    this.animator.updateLocomotion(speedThisFrame, sprinting);

    if (typeof window !== "undefined") {
      (window as unknown as { __qaPlayerDebug?: unknown }).__qaPlayerDebug = {
        axis: { x: moveAxis.x, z: moveAxis.z },
        sprinting,
        speedThisFrame,
        dodgeRemaining: this.dodgeTimeRemaining,
        dodgeDirection: this.dodgeDirection.asArray(),
        lastMoveDirection: this.lastMoveDirection.asArray(),
        movementDirection: debugMoveDirection.asArray(),
        position: this.mesh.position.asArray(),
        deltaTime,
      };
    }

    if (this.input.consumeDodgeRoll()) {
      const baseDirection =
        movementDirection.lengthSquared() > 0
          ? movementDirection
          : this.lastMoveDirection.lengthSquared() > 0
          ? this.lastMoveDirection
          : this.getFacingDirection();
      if (baseDirection.lengthSquared() > 0) {
        this.dodgeDirection.copyFrom(baseDirection);
      } else {
        this.dodgeDirection.set(0, 0, 1);
      }
      this.dodgeDirection.normalize();
      this.dodgeTimeRemaining = this.dodgeDuration;
      this.animator.playDodgeRoll();
    }

    if (this.input.consumeAttack()) {
      this.animator.playAttack();
      // TODO: Connect to the CombatSystem for hit detection and damage application.
    }
  }

  /**
   * Access the character's transform node for camera or attachment utilities.
   */
  getMesh(): TransformNode {
    return this.mesh;
  }

  /**
   * Access the current world position of the player mesh.
   */
  getPosition(): Vector3 {
    return this.mesh.getAbsolutePosition();
  }

  private computeMovementDirection(axis: { x: number; z: number }): Vector3 {
    if (axis.x === 0 && axis.z === 0) {
      return Vector3.Zero();
    }

    const scene = this.mesh.getScene();
    const activeCamera: Camera | null = scene?.activeCamera ?? null;
    if (!activeCamera) {
      return new Vector3(axis.x, 0, axis.z);
    }

    const forward = activeCamera.getForwardRay().direction.clone();
    forward.y = 0;
    if (forward.lengthSquared() === 0) {
      forward.set(0, 0, 1);
    } else {
      forward.normalize();
    }

    forward.scaleInPlace(-1);

    let right = Vector3.Cross(Vector3.Up(), forward);
    if (right.lengthSquared() === 0) {
      right = new Vector3(1, 0, 0);
    } else {
      right.normalize();
    }

    const movement = forward.scale(axis.z).addInPlace(right.scale(axis.x));
    return movement;
  }

  private getFacingDirection(): Vector3 {
    const yaw = this.mesh.rotation.y;
    const facing = new Vector3(Math.sin(yaw), 0, Math.cos(yaw));
    if (facing.lengthSquared() === 0) {
      return new Vector3(0, 0, 1);
    }
    return facing.normalize();
  }
}
