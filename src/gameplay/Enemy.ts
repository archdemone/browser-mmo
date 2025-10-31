import { Color3, MeshBuilder, Scene, StandardMaterial, TransformNode, Vector3 } from "babylonjs";
import { createEnemyCharacter } from "../visuals/CharacterFactory";
import type { Player } from "./Player";
import type { PlayerAnimator } from "../visuals/PlayerAnimator";

type EnemyState = "chase" | "windup" | "strike" | "recover";

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
  private state: EnemyState = "chase";
  private windupTimer: number = 0;
  private recoverTimer: number = 0;
  attackWindup: number = 0.4;
  attackRecover: number = 0.6;
  isTelegraphing: boolean = false;
  private hitFlashTimer: number = 0;
  private baseMaterial: StandardMaterial | null = null;
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
    this.resetStateMachine();
    this.storeBaseMaterial();
  }

  static async create(scene: Scene, spawnPos: Vector3): Promise<Enemy> {
    const pooledVisual = Enemy.visualPool.pop() ?? null;
    if (pooledVisual) {
      Enemy.pooledCount = Math.max(0, Enemy.pooledCount - 1);
      const { rootMesh, animator, attackDuration } = pooledVisual;
      Enemy.resetVisual(rootMesh, spawnPos);
      animator?.cancelAttack();
      animator?.updateLocomotion({ speed: 0, normalizedSpeed: 0, sprinting: false });
      animator?.cancelAttack();
      animator?.updateLocomotion({ speed: 0, normalizedSpeed: 0, sprinting: false });
      const enemy = new Enemy(scene, rootMesh, animator, spawnPos, attackDuration, pooledVisual);
      enemy.resetStateMachine();
      return enemy;
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

    if (!player) {
      return;
    }

    const playerPos = player.getPosition();
    const myPos = this.mesh.position;
    const direction = new Vector3(playerPos.x - myPos.x, 0, playerPos.z - myPos.z);
    const distanceSq = direction.lengthSquared();
    const attackRangeSq = 1.2; // slightly larger for telegraphing feel
    let speed = 0;

    // State machine
    switch (this.state) {
      case "chase":
        // Move toward player
        if (distanceSq > 0.0001) {
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

        // If close enough, start windup
        if (distanceSq <= attackRangeSq) {
          this.state = "windup";
          this.windupTimer = this.attackWindup;
          this.isTelegraphing = true;
        }
        break;

      case "windup":
        // No movement during windup
        speed = 0;
        this.windupTimer -= deltaTime;
        this.isTelegraphing = true;

        if (this.windupTimer <= 0) {
          this.state = "strike";
        }
        break;

      case "strike":
        // Play attack animation and apply damage once during strike
        this.animator?.playAttack({ forceRestart: true });
        if (player.isDead() === false && player.invulnTimer <= 0) {
          try {
            player.applyDamage(this.attackDamage);
            console.log(`[COMBAT] Enemy struck player for ${this.attackDamage} dmg`);
          } catch (error) {
            console.warn("[COMBAT] Enemy failed to apply damage to player", error);
          }
        }
        this.state = "recover";
        this.recoverTimer = this.attackRecover;
        this.isTelegraphing = false;
        break;

      case "recover":
        // No movement during recovery
        speed = 0;
        this.recoverTimer -= deltaTime;
        this.isTelegraphing = false;

        if (this.recoverTimer <= 0) {
          this.state = "chase";
        }
        break;
    }

    // Handle hit flash timer
    if (this.hitFlashTimer > 0) {
      this.hitFlashTimer -= deltaTime;
      if (this.hitFlashTimer <= 0) {
        console.log(`[FX] Restoring enemy material after hit flash`);
        // Restore original material
        if (this.mesh && !this.mesh.isDisposed() && this.baseMaterial) {
          for (const child of this.mesh.getChildMeshes()) {
            if (child.material && this.baseMaterial) {
              const mat = child.material;
              const baseMat = this.baseMaterial;
              if ('emissiveColor' in mat && 'emissiveColor' in baseMat && mat.emissiveColor && baseMat.emissiveColor) {
                (mat.emissiveColor as any).copyFrom(baseMat.emissiveColor);
              }
              if ('diffuseColor' in mat && 'diffuseColor' in baseMat && mat.diffuseColor && baseMat.diffuseColor) {
                (mat.diffuseColor as any).copyFrom(baseMat.diffuseColor);
              }
              if ('albedoColor' in mat && 'albedoColor' in baseMat && mat.albedoColor && baseMat.albedoColor) {
                (mat.albedoColor as any).copyFrom(baseMat.albedoColor);
              }
            }
          }
        }
        this.hitFlashTimer = 0; // Ensure it's reset
      }
    }

    const normalizedSpeed = this.moveSpeed > 0 ? Math.min(1, speed / this.moveSpeed) : 0;
    this.animator?.updateLocomotion({ speed, normalizedSpeed, sprinting: false, deltaTime });
  }

  applyDamage(amount: number): void {
    if (this.dead) {
      return;
    }

    this.hp = Math.max(0, this.hp - amount);
    this.hitFlashTimer = 0.1;

    // Flash red
    if (this.mesh && !this.mesh.isDisposed()) {
      for (const child of this.mesh.getChildMeshes()) {
        if (child.material) {
          // Try different material types
          const mat = child.material;
          if ('emissiveColor' in mat && mat.emissiveColor) {
            (mat.emissiveColor as any).set(0.8, 0, 0); // red flash
          } else if ('diffuseColor' in mat && mat.diffuseColor) {
            (mat.diffuseColor as any).set(1, 0.2, 0.2); // reddish tint
          } else if ('albedoColor' in mat && mat.albedoColor) {
            (mat.albedoColor as any).set(1, 0.2, 0.2); // PBR albedo tint
          }
        }
      }
    }

    console.log(`[FX] Enemy hit for ${amount}`);
    console.log(`[COMBAT] Enemy took ${amount} dmg. HP=${this.hp}`);

    if (this.hp <= 0) {
      this.dead = true;
      this.state = "chase"; // reset state
      this.windupTimer = 0;
      this.recoverTimer = 0;
      this.isTelegraphing = false;
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

  private resetStateMachine(): void {
    this.state = "chase";
    this.windupTimer = 0;
    this.recoverTimer = 0;
    this.isTelegraphing = false;
  }

  private storeBaseMaterial(): void {
    if (this.mesh && !this.mesh.isDisposed()) {
      // Try to find the first child mesh with a material
      for (const child of this.mesh.getChildMeshes()) {
        if (child.material) {
          // Clone the material to store original values
          try {
            this.baseMaterial = child.material.clone(`${child.material.name || 'material'}_base`) as StandardMaterial;
          } catch (error) {
            // If cloning fails, create a simple copy of key properties
            this.baseMaterial = child.material as StandardMaterial;
          }
          break;
        }
      }
    }
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
    this.animator?.updateLocomotion({ speed: 0, normalizedSpeed: 0, sprinting: false });

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
