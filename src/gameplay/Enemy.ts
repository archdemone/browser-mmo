import { Color3, MeshBuilder, Scene, StandardMaterial, TransformNode, Vector3 } from "babylonjs";
import { createEnemyCharacter } from "../visuals/CharacterFactory";
import type { Player } from "./Player";
import type { PlayerAnimator } from "../visuals/PlayerAnimator";

interface EnemyVisual {
  rootMesh: TransformNode;
  animator: PlayerAnimator | null;
  attackDuration: number;
}

export class Enemy {
  private static readonly visualPool: EnemyVisual[] = [];
  private static pooledCount: number = 0;

  readonly scene: Scene;
  readonly mesh: TransformNode;
  hp: number = 50;
  moveSpeed: number = 2;
  attackDamage: number = 25;
  attackCooldown: number = 0;
  private dead: boolean = false;
  private readonly animator: PlayerAnimator | null;
  private readonly attackDuration: number;
  private readonly pooledVisual: EnemyVisual | null;
  private readonly visualHandle: EnemyVisual;
  private released: boolean = false;

  private constructor(
    scene: Scene,
    mesh: TransformNode,
    animator: PlayerAnimator | null,
    spawnPos: Vector3,
    attackDuration: number,
    pooledVisual: EnemyVisual | null
  ) {
    this.scene = scene;
    this.mesh = mesh;
    this.animator = animator;
    this.mesh.position.copyFrom(spawnPos);
    this.attackDuration = attackDuration;
    this.pooledVisual = pooledVisual;
    this.visualHandle =
      pooledVisual ?? {
        rootMesh: mesh,
        animator,
        attackDuration,
      };

    Enemy.resetVisual(this.mesh, spawnPos);
  }

  static async create(scene: Scene, spawnPos: Vector3): Promise<Enemy> {
    const pooledVisual = Enemy.visualPool.pop() ?? null;
    if (pooledVisual) {
      Enemy.pooledCount = Math.max(0, Enemy.pooledCount - 1);
      const { rootMesh, animator, attackDuration } = pooledVisual;
      Enemy.resetVisual(rootMesh, spawnPos);
      animator?.cancelAttack();
      animator?.updateLocomotion(0, false);
      animator?.cancelAttack();
      animator?.updateLocomotion(0, false);
      return new Enemy(scene, rootMesh, animator, spawnPos, attackDuration, pooledVisual);
    }

    try {
      const { rootMesh, animator } = await createEnemyCharacter(scene);
      const attackDuration = Math.max(0.1, animator.getAttackDuration() || 0);
      return new Enemy(scene, rootMesh, animator, spawnPos, attackDuration, null);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : typeof error === "object" && error !== null && "message" in (error as Record<string, unknown>)
          ? String((error as Record<string, unknown>).message)
          : "Unknown error";
      console.error("[QA] Enemy.create() failed to load enemy assets, using fallback box.", message, error);
      const fallback = Enemy.createFallbackMesh(scene, spawnPos);
      return new Enemy(scene, fallback, null, spawnPos, 0.7, null);
    }
  }

  update(deltaTime: number, player: Player | null): void {
    if (this.dead) {
      return;
    }

    if (!this.mesh || this.mesh.isDisposed()) {
      this.dead = true;
      return;
    }

    this.attackCooldown = Math.max(0, this.attackCooldown - deltaTime);

    if (!player) {
      return;
    }

    const playerPos = player.getPosition();
    const myPos = this.mesh.position;
    const direction = new Vector3(playerPos.x - myPos.x, 0, playerPos.z - myPos.z);
    const distanceSq = direction.lengthSquared();
    const attackRangeSq = 1.0;
    let attackPlaying = this.animator?.isAttackPlaying() ?? false;
    let speed = 0;

    if (attackPlaying && distanceSq > attackRangeSq) {
      this.animator?.cancelAttack();
      attackPlaying = false;
    }

    if (!attackPlaying && distanceSq > 0.0001) {
      direction.normalize();
      const displacement = direction.scale(this.moveSpeed * deltaTime);
      myPos.addInPlace(displacement);
      if (displacement.lengthSquared() > 1e-6) {
        speed = displacement.length() / Math.max(deltaTime, 1e-4);
      } else {
        speed = 0;
      }
      const facingAngle: number = Math.atan2(direction.x, direction.z) + Math.PI;
      this.mesh.rotation.y = facingAngle;
    }

    if (attackPlaying) {
      speed = 0;
    }

    if (!attackPlaying && distanceSq <= attackRangeSq && this.attackCooldown <= 0) {
      this.animator?.playAttack({ forceRestart: true });
      try {
        player.applyDamage(this.attackDamage);
      } catch (error) {
        console.warn("[COMBAT] Enemy failed to apply damage to player", error);
      }
      const duration = this.attackDuration > 0 ? this.attackDuration : 1.0;
      this.attackCooldown = duration;
      speed = 0;
    }

    this.animator?.updateLocomotion(speed, false);
  }

  applyDamage(amount: number): void {
    if (this.dead) {
      return;
    }

    this.hp = Math.max(0, this.hp - amount);
    console.log(`[COMBAT] Enemy took ${amount} dmg. HP=${this.hp}`);

    if (this.hp <= 0) {
      this.dead = true;
      if (this.mesh && !this.mesh.isDisposed()) {
        this.mesh.setEnabled(false);
      }
      console.log("[COMBAT] Enemy died");
      this.releaseVisual();
    }
  }

  isDead(): boolean {
    return this.dead;
  }

  dispose(): void {
    this.releaseVisual();
  }

  getPosition(): Vector3 {
    if (!this.mesh || this.mesh.isDisposed()) {
      return Vector3.Zero();
    }
    return this.mesh.position.clone();
  }

  private static createFallbackMesh(scene: Scene, spawnPos: Vector3): TransformNode {
    const fallback = MeshBuilder.CreateBox("enemy-fallback", { size: 1.4 }, scene);
    fallback.position.copyFrom(spawnPos);
    fallback.position.y = spawnPos.y || 1;

    const material = new StandardMaterial("enemyFallbackMaterial", scene);
    material.diffuseColor = new Color3(0.7, 0.15, 0.15);
    material.emissiveColor = new Color3(0.25, 0, 0);
    fallback.material = material;
    return fallback;
  }

  private static resetVisual(mesh: TransformNode, spawnPos: Vector3): void {
    mesh.setEnabled(true);
    mesh.position.copyFrom(spawnPos);
    mesh.rotationQuaternion = null;
    mesh.rotation.x = 0;
    mesh.rotation.y = 0;
    mesh.rotation.z = 0;
  }

  private releaseVisual(): void {
    if (this.released) {
      return;
    }
    this.released = true;

    if (!this.mesh || this.mesh.isDisposed()) {
      return;
    }

    this.animator?.cancelAttack();
    this.animator?.updateLocomotion(0, false);

    this.mesh.setEnabled(false);
    this.mesh.position.setAll(0);

    const handle = this.visualHandle;

    Enemy.visualPool.push(handle);
    Enemy.pooledCount += 1;
  }

  static clearVisualPool(): void {
    while (Enemy.visualPool.length > 0) {
      const visual = Enemy.visualPool.pop();
      if (!visual) {
        continue;
      }

      const { rootMesh } = visual;
      if (rootMesh && !rootMesh.isDisposed()) {
        rootMesh.dispose();
      }
    }
    Enemy.pooledCount = 0;
  }
}
