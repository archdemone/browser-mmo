import { Scene, Vector3 } from "babylonjs";
import type { Camera, TransformNode } from "babylonjs";
import type { Input } from "../core/Input";
import { SaveService } from "../state/SaveService";
import { createPlayerCharacter } from "../visuals/CharacterFactory";
import { PlayerAnimator } from "../visuals/PlayerAnimator";

export interface PlayerCollider {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/**
 * Represents the controllable player character.
 */
export class Player {
  private readonly mesh: TransformNode;
  private readonly animator: PlayerAnimator;
  readonly input: Input;
  private readonly walkSpeed: number;
  private readonly sprintSpeed: number;
  private readonly dodgeSpeed: number;
  private readonly dodgeDuration: number;
  private dodgeTimeRemaining: number;
  private readonly dodgeDirection: Vector3;
  private readonly lastMoveDirection: Vector3;
  private debugLoggingActive: boolean = false;
  private dead: boolean = false;
  maxHP: number;
  hp: number;
  contactIframesTimer: number;
  readonly attackDamage: number;
  readonly attackRange: number;
  private attackTriggeredThisFrame: boolean = false;
  private spawnPoint: Vector3;
  invulnTimer: number = 0;
  stamina: number = 100;
  maxStamina: number = 100;
  private staminaRegenRate: number = 20; // per second
  private dodgeCost: number = 20;
  private isInvincible: boolean = false;
  private spawnRotationY: number;
  private collidersProvider: (() => PlayerCollider[]) | null = null;
  private readonly collisionRadius: number = 0.7;

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
    this.maxHP = SaveService.getMaxHP();
    this.hp = SaveService.getHP();
    this.contactIframesTimer = 0;
    this.attackDamage = 20;
    this.attackRange = 2;
    this.spawnPoint = mesh.position.clone();
    this.spawnRotationY = mesh.rotation?.y ?? 0;

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
    this.attackTriggeredThisFrame = false;

    if (this.contactIframesTimer > 0) {
      this.contactIframesTimer = Math.max(0, this.contactIframesTimer - deltaTime);
    }

    if (this.invulnTimer > 0) {
      this.invulnTimer = Math.max(0, this.invulnTimer - deltaTime);
    }

    // Stamina regen
    if (this.stamina < this.maxStamina) {
      this.stamina = Math.min(this.maxStamina, this.stamina + this.staminaRegenRate * deltaTime);
    }

    if (this.dead) {
      this.animator.updateLocomotion(0, false);
      return;
    }

    const colliders = this.collidersProvider?.() ?? null;
    let locomotionSpeed = 0;

    if (movementDirection.lengthSquared() > 0) {
      movementDirection.normalize();
      const baseSpeed = sprinting ? this.sprintSpeed : this.walkSpeed;
      const rawDisplacement = movementDirection.scale(baseSpeed * deltaTime);
      const applied = this.applyDisplacement(rawDisplacement, colliders);
      if (applied.lengthSquared() > 0) {
        locomotionSpeed = applied.length() / Math.max(deltaTime, 1e-4);
        this.lastMoveDirection.copyFrom(applied.normalize());
        const facingAngle: number = Math.atan2(applied.x, applied.z) + Math.PI;
        this.mesh.rotation.y = facingAngle;
      } else {
        const facingAngle: number = Math.atan2(movementDirection.x, movementDirection.z) + Math.PI;
        this.mesh.rotation.y = facingAngle;
        this.lastMoveDirection.copyFrom(movementDirection);
      }
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
      const applied = this.applyDisplacement(displacement, colliders);
      if (applied.lengthSquared() > 0) {
        const appliedSpeed = applied.length() / Math.max(deltaTime, 1e-4);
        locomotionSpeed = Math.max(locomotionSpeed, appliedSpeed);
      }
      this.dodgeTimeRemaining = Math.max(0, this.dodgeTimeRemaining - deltaTime);
    }

    if (this.debugLoggingActive) {
      console.log(
        `[DBG] player beforeAnim pos=(${this.mesh.position.x.toFixed(2)},${this.mesh.position.z.toFixed(
          2
        )}) speed=${locomotionSpeed.toFixed(2)}`
      );
    }

    this.animator.updateLocomotion(locomotionSpeed, sprinting);

    if (typeof window !== "undefined") {
      (window as unknown as { __qaPlayerDebug?: unknown }).__qaPlayerDebug = {
        axis: { x: moveAxis.x, z: moveAxis.z },
        sprinting,
        speedThisFrame: locomotionSpeed,
        dodgeRemaining: this.dodgeTimeRemaining,
        dodgeDirection: this.dodgeDirection.asArray(),
        lastMoveDirection: this.lastMoveDirection.asArray(),
        movementDirection: debugMoveDirection.asArray(),
        position: this.mesh.position.asArray(),
        deltaTime,
      };
    }

    if (this.input.consumeDodgeRoll()) {
      if (this.stamina >= this.dodgeCost) {
        this.stamina -= this.dodgeCost;
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
        this.invulnTimer = 0.4;
        this.animator.playDodgeRoll();
      } else {
        console.log("[COMBAT] Dodge blocked: not enough stamina");
      }
    }

    const attackConsumed = this.input.consumeAttack();
    if (attackConsumed) {
      this.animator.playAttack({ forceRestart: true });
      this.attackTriggeredThisFrame = true;
      console.log("[INPUT] Attack triggered");
    }

    if (this.debugLoggingActive) {
      console.log(
        `[DBG] player afterAnim pos=(${this.mesh.position.x.toFixed(2)},${this.mesh.position.z.toFixed(2)})`
      );
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
    return this.mesh.position.clone();
  }

  applyDamage(amount: number): void {
    if (this.dead || this.contactIframesTimer > 0) {
      return;
    }
    if (this.invulnTimer > 0) {
      console.log("[COMBAT] Attack ignored: dodge i-frame active");
      return;
    }
    if (this.isInvincible) {
      console.log(`[COMBAT] Attack ignored: player is invincible (${amount} dmg prevented)`);
      return;
    }
    this.hp = Math.max(0, this.hp - amount);
    SaveService.setHP(this.hp);
    this.contactIframesTimer = 0.35;
    console.log(`[COMBAT] Player took ${amount} dmg. HP=${this.hp}/${this.maxHP}`);
    if (this.hp <= 0) {
      console.log("[COMBAT] Player died");
      this.handleDeath();
    }
  }

  setInvincible(invincible: boolean): void {
    this.isInvincible = invincible;
    console.log(`[DEBUG] Player invincibility set to: ${invincible}`);
  }

  consumeAttackTrigger(): boolean {
    if (!this.attackTriggeredThisFrame) {
      return false;
    }
    this.attackTriggeredThisFrame = false;
    return true;
  }

  setDebugLoggingActive(active: boolean): void {
    this.debugLoggingActive = active;
    this.animator.setDebugLoggingActive(active);
  }

  isDead(): boolean {
    return this.dead;
  }

  setCollidersProvider(provider: (() => PlayerCollider[]) | null): void {
    this.collidersProvider = provider;
  }

  syncFromSave(): void {
    this.maxHP = SaveService.getMaxHP();
    this.hp = Math.min(this.maxHP, SaveService.getHP());
  }

  setSpawnPoint(position: Vector3, rotationY: number): void {
    this.spawnPoint = position.clone();
    this.spawnRotationY = rotationY;
  }

  teleportTo(position: Vector3, rotationY?: number): void {
    this.mesh.position.copyFrom(position);
    if (typeof rotationY === "number") {
      this.mesh.rotation.y = rotationY;
    }
  }

  teleportToSpawn(): void {
    this.teleportTo(this.spawnPoint, this.spawnRotationY);
  }

  private applyDisplacement(displacement: Vector3, colliders: PlayerCollider[] | null): Vector3 {
    if (displacement.lengthSquared() === 0) {
      return Vector3.Zero();
    }

    if (!colliders || colliders.length === 0) {
      const applied = displacement.clone();
      this.mesh.position.addInPlace(applied);
      return applied;
    }

    const origin = this.mesh.position.clone();
    const nextPos = origin.clone();
    const result = new Vector3(0, 0, 0);

    if (displacement.y !== 0) {
      nextPos.y = origin.y + displacement.y;
      result.y = displacement.y;
    }

    if (displacement.x !== 0) {
      const originalX = nextPos.x;
      nextPos.x = originalX + displacement.x;
      if (this.intersectsAnyCollider(nextPos, colliders)) {
        nextPos.x = originalX;
      } else {
        result.x = displacement.x;
      }
    }

    if (displacement.z !== 0) {
      const originalZ = nextPos.z;
      nextPos.z = originalZ + displacement.z;
      if (this.intersectsAnyCollider(nextPos, colliders)) {
        nextPos.z = originalZ;
      } else {
        result.z = displacement.z;
      }
    }

    this.mesh.position.copyFrom(nextPos);
    return result;
  }

  private intersectsAnyCollider(position: Vector3, colliders: PlayerCollider[]): boolean {
    const radiusSq = this.collisionRadius * this.collisionRadius;
    for (const collider of colliders) {
      const closestX = Math.max(collider.minX, Math.min(position.x, collider.maxX));
      const closestZ = Math.max(collider.minZ, Math.min(position.z, collider.maxZ));
      const dx = position.x - closestX;
      const dz = position.z - closestZ;
      if (dx * dx + dz * dz <= radiusSq) {
        return true;
      }
    }
    return false;
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

  private handleDeath(): void {
    if (this.dead) {
      return;
    }
    this.dead = true;
    this.hp = 0;
    SaveService.setHP(this.hp);
    this.dodgeTimeRemaining = 0;
    this.invulnTimer = 0;
    this.stamina = this.maxStamina; // full stamina on death
    this.animator.cancelAttack();
    this.animator.updateLocomotion(0, false);
  }

  respawn(): void {
    if (!this.dead) {
      return;
    }
    SaveService.resetHPFull();
    this.syncFromSave();
    this.dead = false;
    this.contactIframesTimer = 1.0;
    this.invulnTimer = 1.0;
    this.dodgeTimeRemaining = 0;
    this.dodgeDirection.set(0, 0, 1);
    this.lastMoveDirection.set(0, 0, 1);
    this.teleportToSpawn();
    this.animator.cancelAttack();
    this.animator.updateLocomotion(0, false);
    console.log(
      `[COMBAT] Player respawned at (${this.mesh.position.x.toFixed(2)}, ${this.mesh.position.z.toFixed(
        2
      )}) with full HP (${this.hp}/${this.maxHP})`
    );
  }
}
