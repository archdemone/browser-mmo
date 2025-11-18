import type { Enemy } from "./Enemy";
import type { Player } from "./Player";
import { SaveService } from "../state/SaveService";
import { FloatingText } from "../ui/FloatingText";
import { MovementEnvironment } from "../skills/MovementAPI";
import {
  DamageApplicationInfo,
  DamageApplicationResult,
  HitContext,
  SkillExecutor,
  SkillTarget,
} from "../skills/SkillExecutor";
import { SkillMetrics } from "../metrics/SkillMetrics";
import { StatusApplication, StatusDefaults, StatusSystem, StatusType } from "../skills/StatusSystem";
import { getDerivedSkill } from "../devtools/SkillLabManager";
import { getSkill } from "../skills/skills.registry";
import type { SkillData } from "../skills/skills.schema";
import type { Vector3Like } from "../skills/HitGeometry";

export class CombatSystem {
  private readonly skillExecutor = new SkillExecutor();
  private readonly skillMetrics = new SkillMetrics();
  private readonly statusSystem = new StatusSystem();
  private readonly movementEnvironment: MovementEnvironment = {
    isObstructed: () => false,
  };

  playerAttack(player: Player, enemies: Enemy[]): void {
    const skill = this.resolveActiveSkill();
    if (!skill) {
      console.warn("[COMBAT] No active skill available for player");
      return;
    }
    this.executeSkill(player, skill, enemies);
  }

  castSkill(player: Player, skill: SkillData, enemies: Enemy[]): void {
    if (!skill) {
      console.warn("[COMBAT] No skill provided for cast");
      return;
    }
    this.executeSkill(player, skill, enemies);
  }

  private resolveActiveSkill(): SkillData | null {
    return getDerivedSkill() ?? getSkill("warrior-heavy-strike") ?? null;
  }

  private executeSkill(player: Player, skill: SkillData, enemies: Enemy[]): void {
    const aliveEnemies = enemies.filter((enemy) => !enemy.isDead());
    if (aliveEnemies.length === 0) {
      return;
    }

    const targets = aliveEnemies.map((enemy) => new EnemySkillTarget(enemy));
    const playerPosition = player.getPosition();
    const facingDirection = player.getFacingDirection();

    this.statusSystem.tick(performance.now() / 1000);

    const castResult = this.skillExecutor.execute(skill, {
      caster: {
        id: "player",
        position: {
          x: playerPosition.x,
          y: playerPosition.y,
          z: playerPosition.z,
        },
        facing: {
          x: facingDirection.x,
          y: facingDirection.y,
          z: facingDirection.z,
        },
        radius: 0.7,
        power: 1,
      },
      targets,
      environment: this.movementEnvironment,
      applyDamage: (target, amount, info) => this.handleDamage(target, amount, info),
      metrics: this.skillMetrics,
      hooks: {
        onHit: (context) => this.applyStatusFromContext(context),
      },
    });

    this.statusSystem.tick(performance.now() / 1000);

    console.log(
      `[COMBAT] Cast ${skill.name}: hits=${castResult.hits}, targets=${castResult.targetsHit}`
    );
  }

  private handleDamage(
    target: EnemySkillTarget,
    amount: number,
    _info: DamageApplicationInfo
  ): DamageApplicationResult {
    const enemy = target.enemy;
    if (enemy.isDead()) {
      return { applied: 0, killed: true, remainingHealth: enemy.hp };
    }
    const prevHp = enemy.hp;
    enemy.applyDamage(amount);
    const currentHp = enemy.hp;
    const applied = Math.max(0, prevHp - currentHp);
    if (applied > 0) {
      FloatingText.spawnDamageText(applied);
    }
    const killed = enemy.isDead();
    if (applied > 0 && killed) {
      SaveService.addXP(10);
    }
    return {
      applied,
      killed,
      remainingHealth: currentHp,
    };
  }

  private applyStatusFromContext(context: HitContext): void {
    const statusConfig = context.component.status ?? context.skill.statusDefaults;
    if (!statusConfig) {
      return;
    }
    const currentTime = context.time;
    const entries = Object.entries(statusConfig) as [StatusType, StatusDefaults[StatusType]][];
    for (const [statusKey, payload] of entries) {
      if (!payload) {
        continue;
      }
      const application = this.buildStatusApplication(payload);
      application.sourceId = `${context.skill.id}:${context.component.id}`;
      this.statusSystem.applyStatus(context.target.id, statusKey, application, currentTime);
    }
  }

  private buildStatusApplication(payload: StatusDefaults[keyof StatusDefaults]): StatusApplication {
    const values = payload as Record<string, number | undefined>;
    const application: StatusApplication = {};
    if (values.dur !== undefined) {
      application.duration = values.dur;
    }
    if (values.pctOverTime !== undefined) {
      application.potency = values.pctOverTime;
    }
    if (values.drPctPerStack !== undefined) {
      application.potency = values.drPctPerStack;
    }
    if (values.chance !== undefined) {
      application.potency = values.chance;
    }
    if (values.meters !== undefined) {
      application.potency = values.meters;
    }
    if (values.stacksMax !== undefined) {
      application.maxStacksOverride = values.stacksMax;
    }
    if (values.immunityMs !== undefined) {
      application.duration = application.duration ?? values.immunityMs / 1000;
    }
    return application;
  }
}

class EnemySkillTarget implements SkillTarget {
  private readonly fallbackId = Math.random().toString(36).slice(2);

  constructor(public readonly enemy: Enemy) {}

  get id(): string {
    const mesh = this.enemy.mesh;
    const descriptor = mesh ? mesh.uniqueId ?? mesh.name ?? this.fallbackId : this.fallbackId;
    return `enemy-${descriptor}`;
  }

  get position(): Vector3Like {
    return this.enemy.getPosition();
  }

  get radius(): number {
    return 0.85;
  }

  get health(): number {
    return Math.max(0, this.enemy.hp);
  }
}
