import { Scene, Vector3 } from "babylonjs";
import type { Camera, TransformNode } from "babylonjs";
import type { Input } from "../core/Input";
import { SaveService } from "../state/SaveService";
import { createPlayerCharacter } from "../visuals/CharacterFactory";
import { PlayerAnimator } from "../visuals/PlayerAnimator";
import { DEBUG_EDITOR } from "../core/DebugFlags";
import type { CameraRig } from "../visuals/CameraRig";

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
  private readonly moveVelocity: Vector3;
  private readonly targetVelocity: Vector3;
  private readonly desiredDirection: Vector3;
  private readonly frameDisplacement: Vector3;
  private readonly fallbackForward: Vector3;
  private readonly fallbackRight: Vector3;
  private readonly moveSpeed: number;
  private readonly sprintSpeed: number;
  private readonly accel: number;
  private readonly decel: number;
  private readonly faceTurnSpeed: number;
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
  private readonly accelEpsilonSq: number = 1e-4;
  private cameraRig: CameraRig | null = null;

  private static readonly ZERO = Vector3.Zero();

  private constructor(mesh: TransformNode, animator: PlayerAnimator, input: Input) {
    this.mesh = mesh;
    if (this.mesh.rotationQuaternion) {
      this.mesh.rotationQuaternion = null;
    }
    this.animator = animator;
    this.input = input;
    this.moveVelocity = new Vector3(0, 0, 0);
    this.targetVelocity = new Vector3(0, 0, 0);
    this.desiredDirection = new Vector3(0, 0, 1);
    this.frameDisplacement = new Vector3(0, 0, 0);
    this.fallbackForward = new Vector3(0, 0, 1);
    this.fallbackRight = new Vector3(1, 0, 0);
    this.moveSpeed = 6;
    this.sprintSpeed = 8.5;
    this.accel = 18;
    this.decel = 22;
    this.faceTurnSpeed = 14;
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
    const axes = this.input.getMoveAxes();
    const sprinting = this.input.isSprinting();
    this.attackTriggeredThisFrame = false;

    if (this.contactIframesTimer > 0) {
      this.contactIframesTimer = Math.max(0, this.contactIframesTimer - deltaTime);
    }

    if (this.invulnTimer > 0) {
      this.invulnTimer = Math.max(0, this.invulnTimer - deltaTime);
    }

    if (this.stamina < this.maxStamina) {
      this.stamina = Math.min(this.maxStamina, this.stamina + this.staminaRegenRate * deltaTime);
    }

    if (this.dead) {
      this.animator.updateLocomotion({ speed: 0, normalizedSpeed: 0, sprinting: false, deltaTime });
      return;
    }

    const colliders = this.collidersProvider?.() ?? null;
    this.resolveGroundBasis(this.fallbackForward, this.fallbackRight);

    const axisMagnitudeSq = axes.x * axes.x + axes.y * axes.y;
    const hasAxisInput = axisMagnitudeSq > this.accelEpsilonSq;
    let locomotionSpeed = 0;
    let normalizedSpeed = 0;
    const radToDeg = 180 / Math.PI;
    let targetYawForDebug = this.mesh.rotation.y;
    let activeDodgeSource: "none" | "cached" | "last" | "forward" = "none";

    if (hasAxisInput) {
      this.desiredDirection.copyFrom(this.fallbackRight).scaleInPlace(axes.x);
      this.targetVelocity.copyFrom(this.fallbackForward).scaleInPlace(axes.y);
      this.desiredDirection.addInPlace(this.targetVelocity);
      this.desiredDirection.y = 0;

      if (this.desiredDirection.lengthSquared() < this.accelEpsilonSq) {
        this.desiredDirection.copyFrom(this.fallbackForward);
      } else {
        this.desiredDirection.normalize();
      }

      this.targetVelocity
        .copyFrom(this.desiredDirection)
        .scaleInPlace(sprinting ? this.sprintSpeed : this.moveSpeed);
      const accelAmount = 1 - Math.exp(-this.accel * deltaTime);
      Vector3.LerpToRef(this.moveVelocity, this.targetVelocity, accelAmount, this.moveVelocity);
    } else {
      this.desiredDirection.set(0, 0, 0);
      const decelAmount = 1 - Math.exp(-this.decel * deltaTime);
      Vector3.LerpToRef(this.moveVelocity, Player.ZERO, decelAmount, this.moveVelocity);
    }

    this.frameDisplacement.copyFrom(this.moveVelocity).scaleInPlace(deltaTime);
    const applied = this.applyDisplacement(this.frameDisplacement, colliders);
    if (deltaTime > 0) {
      const invDelta = 1 / Math.max(deltaTime, 1e-4);
      if (applied.lengthSquared() > this.accelEpsilonSq) {
        this.moveVelocity.copyFrom(applied).scaleInPlace(invDelta);
      } else {
        this.moveVelocity.set(0, 0, 0);
      }
    }

    locomotionSpeed = this.moveVelocity.length();
    if (locomotionSpeed > 0.05) {
      this.lastMoveDirection.copyFrom(this.moveVelocity).normalize();
      const desiredYaw = Math.atan2(this.moveVelocity.x, this.moveVelocity.z);
      targetYawForDebug = desiredYaw;
      const turnAmount = 1 - Math.exp(-this.faceTurnSpeed * deltaTime);
      this.mesh.rotation.y = Player.lerpAngle(this.mesh.rotation.y, desiredYaw, turnAmount);
    } else if (hasAxisInput && this.desiredDirection.lengthSquared() > this.accelEpsilonSq) {
      this.lastMoveDirection.copyFrom(this.desiredDirection);
      const desiredYaw = Math.atan2(this.desiredDirection.x, this.desiredDirection.z);
      targetYawForDebug = desiredYaw;
      const turnAmount = 1 - Math.exp(-this.faceTurnSpeed * deltaTime);
      this.mesh.rotation.y = Player.lerpAngle(this.mesh.rotation.y, desiredYaw, turnAmount);
    }

    normalizedSpeed = this.moveSpeed > 0 ? Math.min(1, locomotionSpeed / this.moveSpeed) : 0;

    if (this.dodgeTimeRemaining > 0) {
      const dodgeSource =
        this.dodgeDirection.lengthSquared() > this.accelEpsilonSq
          ? this.dodgeDirection
          : this.lastMoveDirection.lengthSquared() > this.accelEpsilonSq
          ? this.lastMoveDirection
          : this.fallbackForward;
      this.targetVelocity.copyFrom(dodgeSource).normalize();
      this.frameDisplacement.copyFrom(this.targetVelocity).scaleInPlace(this.dodgeSpeed * deltaTime);
      const dodgeApplied = this.applyDisplacement(this.frameDisplacement, colliders);
      if (dodgeApplied.lengthSquared() > this.accelEpsilonSq) {
        const dodgeSpeed = dodgeApplied.length() / Math.max(deltaTime, 1e-4);
        locomotionSpeed = Math.max(locomotionSpeed, dodgeSpeed);
        normalizedSpeed = Math.max(normalizedSpeed, Math.min(1, dodgeSpeed / this.moveSpeed));
        const dodgeYaw = Math.atan2(dodgeApplied.x, dodgeApplied.z);
        targetYawForDebug = dodgeYaw;
        const turnAmount = 1 - Math.exp(-this.faceTurnSpeed * deltaTime);
        this.mesh.rotation.y = Player.lerpAngle(this.mesh.rotation.y, dodgeYaw, turnAmount);
        this.lastMoveDirection.copyFrom(this.targetVelocity);
      }
      activeDodgeSource =
        this.dodgeDirection.lengthSquared() > this.accelEpsilonSq
          ? "cached"
          : this.lastMoveDirection.lengthSquared() > this.accelEpsilonSq
          ? "last"
          : "forward";
      this.dodgeTimeRemaining = Math.max(0, this.dodgeTimeRemaining - deltaTime);
    }

    const dodgePlanUsesLastDir = hasAxisInput && this.lastMoveDirection.lengthSquared() > this.accelEpsilonSq;
    const dodgePlanLabel = dodgePlanUsesLastDir ? "lastMoveDir" : "cameraForward";

    if (DEBUG_EDITOR && this.debugLoggingActive) {
      const currentYawDeg = this.mesh.rotation.y * radToDeg;
      const desiredYawDeg = targetYawForDebug * radToDeg;
      console.log(
        `[DBG] speed=${locomotionSpeed.toFixed(2)} norm=${normalizedSpeed.toFixed(2)} axes=(${axes.x.toFixed(2)},${axes.y.toFixed(
          2
        )}) yaw=${currentYawDeg.toFixed(1)}deg->${desiredYawDeg.toFixed(1)}deg dodgePlan=${dodgePlanLabel} dodgeActive=${activeDodgeSource}`
      );
    }

    this.animator.updateLocomotion({ speed: locomotionSpeed, normalizedSpeed, sprinting, deltaTime });

    if (typeof window !== "undefined") {
      (window as unknown as { __qaPlayerDebug?: unknown }).__qaPlayerDebug = {
        axes,
        sprinting,
        speedThisFrame: locomotionSpeed,
        normalizedSpeed,
        velocity: this.moveVelocity.asArray(),
        desiredDirection: this.desiredDirection.asArray(),
        dodgeRemaining: this.dodgeTimeRemaining,
        dodgeDirection: this.dodgeDirection.asArray(),
        lastMoveDirection: this.lastMoveDirection.asArray(),
        position: this.mesh.position.asArray(),
        yaw: this.mesh.rotation.y,
        targetYaw: targetYawForDebug,
        dodgePlan: dodgePlanLabel,
        dodgeActiveSource: activeDodgeSource,
        deltaTime,
      };
    }

    if (this.input.consumeDodgeRoll()) {
      if (this.stamina >= this.dodgeCost) {
        this.stamina -= this.dodgeCost;
        const baseDirection =
          hasAxisInput && this.lastMoveDirection.lengthSquared() > this.accelEpsilonSq
            ? this.lastMoveDirection
            : this.fallbackForward;
        this.dodgeDirection.copyFrom(baseDirection);
        if (this.dodgeDirection.lengthSquared() < this.accelEpsilonSq) {
          this.dodgeDirection.set(0, 0, 1);
        } else {
          this.dodgeDirection.normalize();
        }
        this.lastMoveDirection.copyFrom(this.dodgeDirection);
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
    if (this.isInvincible === invincible) {
      return;
    }
    this.isInvincible = invincible;
    if (DEBUG_EDITOR) {
      console.debug(`[Player] Invincibility set to: ${invincible}`);
    }
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

  setCameraRig(cameraRig: CameraRig | null): void {
    this.cameraRig = cameraRig;
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

  private resolveGroundBasis(forwardOut: Vector3, rightOut: Vector3): void {
    if (this.cameraRig) {
      forwardOut.copyFrom(this.cameraRig.getGroundForward());
      rightOut.copyFrom(this.cameraRig.getGroundRight());
      return;
    }

    const scene = this.mesh.getScene();
    const activeCamera: Camera | null = scene?.activeCamera ?? null;
    if (activeCamera) {
      const ray = activeCamera.getForwardRay();
      forwardOut.copyFrom(ray.direction);
      forwardOut.y = 0;
      if (forwardOut.lengthSquared() < this.accelEpsilonSq) {
        forwardOut.set(0, 0, 1);
      } else {
        forwardOut.normalize();
      }
    } else {
      forwardOut.set(0, 0, 1);
    }

    Vector3.CrossToRef(Vector3.Up(), forwardOut, rightOut);
    rightOut.y = 0;
    if (rightOut.lengthSquared() < this.accelEpsilonSq) {
      rightOut.set(1, 0, 0);
    } else {
      rightOut.normalize();
    }
  }

  private static lerpAngle(current: number, target: number, amount: number): number {
    if (!Number.isFinite(amount)) {
      return target;
    }
    const t = Math.min(Math.max(amount, 0), 1);
    const twoPi = Math.PI * 2;
    let delta = (target - current) % twoPi;
    if (delta > Math.PI) {
      delta -= twoPi;
    } else if (delta < -Math.PI) {
      delta += twoPi;
    }
    return current + delta * t;
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
    this.animator.updateLocomotion({ speed: 0, normalizedSpeed: 0, sprinting: false });
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
    this.animator.updateLocomotion({ speed: 0, normalizedSpeed: 0, sprinting: false });
    console.log(
      `[COMBAT] Player respawned at (${this.mesh.position.x.toFixed(2)}, ${this.mesh.position.z.toFixed(
        2
      )}) with full HP (${this.hp}/${this.maxHP})`
    );
  }
}
