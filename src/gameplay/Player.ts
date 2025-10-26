import { Scene, Vector3 } from "babylonjs";
import type { TransformNode } from "babylonjs";
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
  private readonly moveSpeedRun: number;
  private readonly moveSpeedSprint: number;

  private constructor(mesh: TransformNode, animator: PlayerAnimator, input: Input) {
    this.mesh = mesh;
    if (this.mesh.rotationQuaternion) {
      this.mesh.rotationQuaternion = null;
    }

    this.animator = animator;
    this.input = input;
    this.moveSpeedRun = 5;
    this.moveSpeedSprint = 8;
  }

  /**
   * Asynchronously load the player mesh and animations.
   */
  static async createAsync(scene: Scene, input: Input): Promise<Player> {
    const { rootMesh, animator } = await createPlayerCharacter(scene);
    return new Player(rootMesh, animator, input);
  }

  /**
   * Update the player's position, facing, and animation state.
   */
  update(deltaTime: number): void {
    const moveAxis = this.input.getMoveAxis();
    const sprinting = this.input.isSprinting();
    const movementDirection = new Vector3(moveAxis.x, 0, moveAxis.z);
    let currentSpeed = 0;

    if (movementDirection.lengthSquared() > 0) {
      movementDirection.normalize();
      currentSpeed = sprinting ? this.moveSpeedSprint : this.moveSpeedRun;
      const displacement = movementDirection.scale(currentSpeed * deltaTime);
      this.mesh.position.addInPlace(displacement);

      const facingAngle: number = Math.atan2(movementDirection.x, movementDirection.z);
      this.mesh.rotation.y = facingAngle;
    }

    this.animator.updateLocomotion(currentSpeed, sprinting);

    if (this.input.consumeDodgeRoll()) {
      this.animator.playDodgeRoll();
      // TODO: Apply a short directional burst when the dodge roll triggers.
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
}
