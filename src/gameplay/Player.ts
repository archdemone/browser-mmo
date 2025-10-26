import { MeshBuilder, Scene, Vector3 } from "babylonjs";
import type { Mesh } from "babylonjs";
import type { Input } from "../core/Input";

/**
 * Represents the controllable player character.
 */
export class Player {
  private readonly mesh: Mesh;
  private readonly moveSpeed: number = 6;

  // TODO: Integrate runtime stats, animations, and abilities once those systems are available.

  constructor(scene: Scene) {
    this.mesh = MeshBuilder.CreateBox("player", { size: 1 }, scene);
    this.mesh.position = new Vector3(0, 0.5, 0);
  }

  /**
   * Update the player's position and facing based on the provided input.
   */
  update(deltaTime: number, input: Input): void {
    const axis = input.getMoveAxis();
    const movement = new Vector3(axis.x, 0, axis.z);

    if (!movement.equals(Vector3.Zero())) {
      movement.normalize().scaleInPlace(this.moveSpeed * deltaTime);
      this.mesh.position.addInPlace(movement);

      const facingAngle: number = Math.atan2(axis.x, axis.z);
      this.mesh.rotation.y = facingAngle;
    }
  }

  /**
   * Get the underlying Babylon mesh for attachment or rendering helpers.
   */
  getMesh(): Mesh {
    return this.mesh;
  }

  /**
   * Access the current world position of the player mesh.
   */
  getPosition(): Vector3 {
    return this.mesh.position;
  }
}
