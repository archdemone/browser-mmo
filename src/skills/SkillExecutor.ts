import {
  SkillComponent,
  SkillData,
} from "./skills.schema";
import {
  GizmoCommand,
  HitTestEntity,
  HitVolume,
  ProjectileVolume,
  spawnCircle,
  spawnCone,
  spawnLine,
  spawnProjectile,
  spawnRing,
  Vector3Like,
} from "./HitGeometry";
import {
  executeMovement,
  MovementActor,
  MovementEnvironment,
  MovementOptions,
  MovementResult,
  MovementActionRequest,
} from "./MovementAPI";
import { SkillMetrics } from "../metrics/SkillMetrics";

type CastVector = Vector3Like;

export interface SkillCaster {
  id: string;
  position: CastVector;
  facing: CastVector;
  radius: number;
  power: number;
}

export interface SkillTarget extends HitTestEntity {
  health: number;
}

export interface DamageApplicationInfo {
  castId: string;
  componentId: string;
  skillId: string;
  time: number;
  baseDamage: number;
  crit: boolean;
}

export interface DamageApplicationResult {
  applied: number;
  killed: boolean;
  remainingHealth?: number;
}

export interface SkillExecutionHooks {
  preHit?(context: HitContext): HitModifiers | void;
  onHit?(context: HitContext, result: DamageApplicationResult): void;
  postHit?(context: HitContext, result: DamageApplicationResult): void;
}

export interface HitContext {
  castId: string;
  component: SkillComponent;
  skill: SkillData;
  caster: SkillCaster;
  target: SkillTarget;
  time: number;
  baseDamage: number;
  ledgerKey: string;
}

export interface HitModifiers {
  damageMultiplier?: number;
  addedDamage?: number;
  overrideDamage?: number;
  crit?: boolean;
}

export interface SkillExecutionContext {
  caster: SkillCaster;
  targets: SkillTarget[];
  environment: MovementEnvironment;
  applyDamage(
    target: SkillTarget,
    amount: number,
    info: DamageApplicationInfo
  ): DamageApplicationResult;
  resolveTargetPosition?(component: SkillComponent): Vector3Like | undefined;
  hooks?: SkillExecutionHooks;
  metrics?: SkillMetrics;
  gizmoEmitter?: (command: GizmoCommand) => void;
  currentTime?: number;
}

export interface SkillExecutionOptions {
  castId?: string;
  deterministic?: boolean;
  seed?: number;
  fixedDelta?: number;
  startTime?: number;
  ignoreCost?: boolean;
  ignoreCooldown?: boolean;
  maxDuration?: number;
}

export interface SkillExecutionResult {
  castId: string;
  duration: number;
  hits: number;
  targetsHit: number;
  movement?: MovementResult[];
}

const DEFAULT_FIXED_DELTA = 1 / 60;

export class SkillExecutor {
  private readonly random = new DeterministicRandom();

  execute(
    skill: SkillData,
    context: SkillExecutionContext,
    options: SkillExecutionOptions = {}
  ): SkillExecutionResult {
    const startTime = options.startTime ?? 0;
    const fixedDelta = options.fixedDelta ?? DEFAULT_FIXED_DELTA;
    const maxDuration = options.maxDuration ?? 30;

    if (options.deterministic) {
      this.random.seed(options.seed ?? 1);
    }

    const castId =
      options.castId ??
      (options.deterministic
        ? `${skill.id}-${Math.floor(this.random.next() * 1e9).toString(16)}`
        : `${skill.id}-${Date.now().toString(36)}-${Math.random()
            .toString(16)
            .slice(2)}`);

    const sortedComponents = [...skill.components].sort(
      (a, b) => a.timing.start - b.timing.start
    );

    const ledger = new HitLedger(castId);
    const metrics = context.metrics;
    metrics?.beginCast(castId, startTime);

    let currentTime = startTime;
    let totalHits = 0;
    const componentSummaries = new Map<string, ComponentSummary>();
    const movementResults: MovementResult[] = [];
    let casterState: SkillCaster = {
      ...context.caster,
      position: { ...context.caster.position },
      facing: normalize(context.caster.facing),
    };

    for (const component of sortedComponents) {
      currentTime = Math.max(currentTime, startTime + component.timing.start);
      const summary = componentSummaries.get(component.id) ?? {
        hits: 0,
        targets: new Set<string>(),
      };

      if (component.movement) {
        const movementOptions: MovementOptions = {};
        if (context.resolveTargetPosition) {
          movementOptions.targetPosition = context.resolveTargetPosition(component);
        }
        const movementActor: MovementActor = {
          id: casterState.id,
          position: { ...casterState.position },
          facing: { ...casterState.facing },
          radius: casterState.radius,
        };
        const movementRequest: MovementActionRequest = {
          action: component.movement,
          options: movementOptions,
        };
        const result = executeMovement(
          movementActor,
          movementRequest,
          context.environment
        );
        movementResults.push(result);
        casterState = {
          ...casterState,
          position: { ...result.finalPosition },
        };
        if (result.cancelled) {
          continue;
        }
      }

      if (!component.shape) {
        componentSummaries.set(component.id, summary);
        continue;
      }

      const tickInterval =
        component.timing.tickRate && component.timing.tickRate > 0
          ? 1 / component.timing.tickRate
          : null;
      const duration = component.timing.duration ?? 0;
      const endTime = currentTime + duration;

      if (component.shape.type === "projectile") {
        const projectiles = spawnProjectile({
          origin: casterState.position,
          direction: casterState.facing,
          speed: component.shape.speed,
          lifetime: component.shape.lifetime,
          count: component.shape.count,
          pierce: component.shape.pierce,
          chain: component.shape.chain,
        });
        const projectileSummary = this.processProjectiles(
          projectiles,
          component,
          skill,
          context,
          ledger,
          summary,
          casterState,
          metrics,
          castId,
          currentTime,
          fixedDelta,
          maxDuration
        );
        totalHits += projectileSummary.hits;
        componentSummaries.set(component.id, projectileSummary);
        continue;
      }

      let tickTime = currentTime;
      do {
        const volume = this.createVolume(component, casterState);
        if (context.gizmoEmitter && volume.drawGizmo) {
          volume.drawGizmo(context.gizmoEmitter);
        }
        const hits = this.processVolume(
          volume,
          component,
          skill,
          context,
          ledger,
          summary,
          tickTime,
          casterState,
          metrics,
          castId
        );
        totalHits += hits;
        tickTime += tickInterval ?? (duration > 0 ? duration : fixedDelta);
      } while (
        tickInterval !== null &&
        tickTime <= endTime + 1e-4 &&
        tickTime - currentTime <= maxDuration
      );

      componentSummaries.set(component.id, summary);
      currentTime = Math.min(endTime, startTime + maxDuration);
    }

    metrics?.endCast(castId, currentTime);
    const targetsHit = Array.from(componentSummaries.values()).reduce(
      (sum, entry) => sum + entry.targets.size,
      0
    );

    return {
      castId,
      duration: currentTime - startTime,
      hits: totalHits,
      targetsHit,
      movement: movementResults,
    };
  }

  private processVolume(
    volume: HitVolume,
    component: SkillComponent,
    skill: SkillData,
    context: SkillExecutionContext,
    ledger: HitLedger,
    summary: ComponentSummary,
    time: number,
    caster: SkillCaster,
    metrics: SkillMetrics | undefined,
    castId: string
  ): number {
    let hits = 0;
    const maxTargets = component.limits?.maxTargets ?? Number.MAX_SAFE_INTEGER;
    const perTargetCooldownMs = component.limits?.perTargetCooldownMs ?? 0;
    const groupId = component.limits?.groupId ?? component.id;

    for (const target of context.targets) {
      if (summary.targets.size >= maxTargets) {
        break;
      }
      const key = ledger.composeKey(target.id, groupId);
      if (!ledger.canHit(target.id, groupId, time, perTargetCooldownMs)) {
        continue;
      }
      if (!volume.overlapTest(target)) {
        continue;
      }

      const baseDamage = calculateBaseDamage(skill, component, caster.power);
      const hitContext: HitContext = {
        castId,
        component,
        skill,
        caster,
        target,
        time,
        baseDamage,
        ledgerKey: key,
      };

      const modifiers = context.hooks?.preHit?.(hitContext) ?? {};
      let damage = baseDamage;
      if (modifiers.overrideDamage !== undefined) {
        damage = modifiers.overrideDamage;
      } else {
        if (modifiers.damageMultiplier !== undefined) {
          damage *= modifiers.damageMultiplier;
        }
        if (modifiers.addedDamage !== undefined) {
          damage += modifiers.addedDamage;
        }
      }

      const damageInfo: DamageApplicationInfo = {
        castId,
        componentId: component.id,
        skillId: skill.id,
        time,
        baseDamage,
        crit: !!modifiers.crit,
      };
      const result = context.applyDamage(target, damage, damageInfo);
      metrics?.recordDamage({
        castId,
        targetId: target.id,
        componentId: component.id,
        amount: result.applied,
        time,
      });
      if (result.killed) {
        metrics?.recordKill({ castId, targetId: target.id, time });
      }

      context.hooks?.onHit?.(hitContext, result);
      context.hooks?.postHit?.(hitContext, result);

      ledger.registerHit(target.id, groupId, time);
      summary.hits += 1;
      summary.targets.add(target.id);
      hits += 1;
    }

    return hits;
  }

  private processProjectiles(
    projectiles: ProjectileVolume[],
    component: SkillComponent,
    skill: SkillData,
    context: SkillExecutionContext,
    ledger: HitLedger,
    summary: ComponentSummary,
    caster: SkillCaster,
    metrics: SkillMetrics | undefined,
    castId: string,
    startTime: number,
    fixedDelta: number,
    maxDuration: number
  ): ComponentSummary {
    const remainingPierce = new Map<string, number>();
    projectiles.forEach((projectile) =>
      remainingPierce.set(projectile.id, projectile.pierce ?? 0)
    );

    let time = startTime;
    while (
      projectiles.length > 0 &&
      time - startTime <= maxDuration
    ) {
      projectiles.forEach((projectile) => projectile.advance(fixedDelta));
      time += fixedDelta;

      for (const projectile of [...projectiles]) {
        if (projectile.isExpired(time - startTime)) {
          projectiles.splice(projectiles.indexOf(projectile), 1);
          continue;
        }

        const hits = this.processVolume(
          projectile,
          component,
          skill,
          context,
          ledger,
          summary,
          time,
          caster,
          metrics,
          castId
        );

        if (hits > 0) {
          const pierceRemaining = remainingPierce.get(projectile.id) ?? 0;
          if (pierceRemaining <= 0) {
            projectiles.splice(projectiles.indexOf(projectile), 1);
          } else {
            remainingPierce.set(projectile.id, pierceRemaining - hits);
          }
        }
      }
    }
    return summary;
  }

  private createVolume(
    component: SkillComponent,
    caster: SkillCaster
  ): HitVolume {
    const shape = component.shape!;
    switch (shape.type) {
      case "circle":
        return spawnCircle(caster.position, shape.radius);
      case "cone":
        return spawnCone(caster.position, caster.facing, shape.angle, shape.range);
      case "line":
        return spawnLine(caster.position, caster.facing, shape.length, shape.width);
      case "ring":
        return spawnRing(caster.position, shape.inner, shape.outer);
      default:
        return spawnCircle(caster.position, 1);
    }
  }
}

interface ComponentSummary {
  hits: number;
  targets: Set<string>;
}

class HitLedger {
  private readonly lastHitTime = new Map<string, number>();

  constructor(private readonly castId: string) {}

  composeKey(targetId: string, groupId: string): string {
    return `${this.castId}:${targetId}:${groupId}`;
  }

  canHit(
    targetId: string,
    groupId: string,
    time: number,
    perTargetCooldownMs: number
  ): boolean {
    const key = this.composeKey(targetId, groupId);
    const lastTime = this.lastHitTime.get(key);
    if (lastTime === undefined) {
      return true;
    }
    const cooldownSeconds = perTargetCooldownMs / 1000;
    return time - lastTime >= cooldownSeconds;
  }

  registerHit(targetId: string, groupId: string, time: number): void {
    const key = this.composeKey(targetId, groupId);
    this.lastHitTime.set(key, time);
  }
}

class DeterministicRandom {
  private state = 1;

  seed(value: number) {
    this.state = value;
  }

  next(): number {
    this.state = (this.state * 16807) % 2147483647;
    return (this.state - 1) / 2147483646;
  }
}

function calculateBaseDamage(
  skill: SkillData,
  component: SkillComponent,
  casterPower: number
): number {
  let base = casterPower * skill.baseMult;
  if (component.damage?.baseMult !== undefined) {
    base *= component.damage.baseMult;
  }
  if (component.damage?.addedFlat !== undefined) {
    base += component.damage.addedFlat;
  }
  if (component.damage?.critOverride !== undefined) {
    base *= component.damage.critOverride;
  }
  return base;
}

function normalize(v: Vector3Like): Vector3Like {
  const length = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
  if (length === 0) {
    return { x: 0, y: 0, z: 0 };
  }
  return { x: v.x / length, y: v.y / length, z: v.z / length };
}
