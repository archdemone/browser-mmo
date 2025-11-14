import { DEFAULT_STATUS_TUNING, STATUS_POLICIES } from "../config/StatusTuning";
import { Vector3Like } from "./HitGeometry";
import { MovementEnvironment } from "./MovementAPI";

export type StatusType = keyof typeof DEFAULT_STATUS_TUNING | (string & {});

export interface StatusInstance {
  type: StatusType;
  stacks: number;
  potency: number;
  maxStacks: number;
  expiresAt: number;
  lastAppliedAt: number;
  activeSince: number;
  sourceId?: string;
}

export interface StatusApplication {
  potency?: number;
  duration?: number;
  addStacks?: number;
  maxStacksOverride?: number;
  sourceId?: string;
}

interface StatusBucket {
  instances: Map<StatusType, StatusInstance>;
  uptime: Map<StatusType, UptimeEntry>;
}

interface UptimeEntry {
  accumulated: number;
  activeSince?: number;
}

export interface StatusExpiry {
  entityId: string;
  status: StatusType;
}

export interface KnockbackEntity {
  id: string;
  position: Vector3Like;
  radius: number;
}

export interface KnockbackOptions {
  direction: Vector3Like;
  meters: number;
  currentTime: number;
  immunityMs?: number;
  stepSize?: number;
}

export interface KnockbackResult {
  applied: boolean;
  finalPosition: Vector3Like;
  distanceTravelled: number;
  collided: boolean;
  immunityActive: boolean;
}

const DEFAULT_STEP_SIZE = 0.1;

export class StatusSystem {
  private readonly buckets = new Map<string, StatusBucket>();
  private readonly knockbackImmunityUntil = new Map<string, number>();

  constructor(
    private readonly statusPolicies = STATUS_POLICIES,
    private readonly statusDefaults = DEFAULT_STATUS_TUNING
  ) {}

  applyStatus(
    entityId: string,
    status: StatusType,
    params: StatusApplication,
    currentTime: number
  ): StatusInstance {
    const bucket = this.ensureBucket(entityId);
    const existing = bucket.instances.get(status);
    const policy = this.statusPolicies[status] ?? {
      stacking: "refresh",
      maxStacks: params.maxStacksOverride ?? 1,
      refreshDurationOnReapply: true,
    };

    const baseDuration =
      params.duration ?? this.getDefaultDuration(status);
    const potency =
      params.potency ?? this.getDefaultPotency(status);
    const maxStacks =
      params.maxStacksOverride ??
      policy.maxStacks ??
      this.getDefaultMaxStacks(status);
    const addStacks = params.addStacks ?? 1;

    if (!existing) {
      const instance: StatusInstance = {
        type: status,
        stacks: Math.min(addStacks, maxStacks),
        potency,
        maxStacks,
        expiresAt: currentTime + baseDuration,
        lastAppliedAt: currentTime,
        activeSince: currentTime,
        sourceId: params.sourceId,
      };
      bucket.instances.set(status, instance);
      this.markUptimeStart(bucket, status, currentTime);
      return { ...instance };
    }

    existing.lastAppliedAt = currentTime;

    switch (policy.stacking) {
      case "add": {
        existing.stacks = Math.min(existing.stacks + addStacks, maxStacks);
        existing.potency = potency;
        if (policy.refreshDurationOnReapply) {
          existing.expiresAt = currentTime + baseDuration;
        }
        break;
      }
      case "extend": {
        existing.stacks = Math.min(maxStacks, addStacks);
        existing.potency = potency;
        existing.expiresAt += baseDuration;
        break;
      }
      case "refresh":
      default: {
        existing.stacks = Math.min(maxStacks, addStacks);
        existing.potency = potency;
        if (policy.refreshDurationOnReapply) {
          existing.expiresAt = currentTime + baseDuration;
        }
        break;
      }
    }

    existing.maxStacks = maxStacks;
    if (!bucket.uptime.get(status)?.activeSince) {
      this.markUptimeStart(bucket, status, currentTime);
    }

    return { ...existing };
  }

  tick(
    currentTime: number,
    entityId?: string
  ): StatusExpiry[] {
    const expired: StatusExpiry[] = [];
    const entries = entityId
      ? [[entityId, this.buckets.get(entityId)] as const]
      : Array.from(this.buckets.entries());

    for (const [id, bucket] of entries) {
      if (!bucket) {
        continue;
      }
      for (const [status, instance] of [...bucket.instances.entries()]) {
        if (currentTime >= instance.expiresAt) {
          expired.push({ entityId: id, status });
          bucket.instances.delete(status);
          this.markUptimeStop(bucket, status, currentTime);
        }
      }
      if (bucket.instances.size === 0 && bucket.uptime.size === 0) {
        this.buckets.delete(id);
      }
    }

    return expired;
  }

  removeStatus(entityId: string, status: StatusType, currentTime: number) {
    const bucket = this.buckets.get(entityId);
    if (!bucket) {
      return;
    }
    if (bucket.instances.delete(status)) {
      this.markUptimeStop(bucket, status, currentTime);
    }
    if (bucket.instances.size === 0 && bucket.uptime.size === 0) {
      this.buckets.delete(entityId);
    }
  }

  getStatus(entityId: string, status: StatusType): StatusInstance | undefined {
    const bucket = this.buckets.get(entityId);
    const instance = bucket?.instances.get(status);
    return instance ? { ...instance } : undefined;
  }

  getStatuses(entityId: string): StatusInstance[] {
    const bucket = this.buckets.get(entityId);
    if (!bucket) {
      return [];
    }
    return Array.from(bucket.instances.values()).map((instance) => ({ ...instance }));
  }

  getUptime(entityId: string, status: StatusType, currentTime?: number): number {
    const bucket = this.buckets.get(entityId);
    if (!bucket) {
      return 0;
    }
    const tracker = bucket.uptime.get(status);
    if (!tracker) {
      return 0;
    }
    let total = tracker.accumulated;
    if (tracker.activeSince !== undefined && currentTime !== undefined) {
      total += currentTime - tracker.activeSince;
    }
    return total;
  }

  clearEntity(entityId: string) {
    this.buckets.delete(entityId);
    this.knockbackImmunityUntil.delete(entityId);
  }

  applyKnockback(
    entity: KnockbackEntity,
    options: KnockbackOptions,
    environment: MovementEnvironment
  ): KnockbackResult {
    const stepSize = options.stepSize ?? DEFAULT_STEP_SIZE;
    const immunityMs = options.immunityMs ?? (this.statusDefaults.knockback?.immunityMs ?? 0);
    const immunityUntil = this.knockbackImmunityUntil.get(entity.id) ?? 0;
    const immunityActive = options.currentTime < immunityUntil;

    if (immunityActive) {
      return {
        applied: false,
        finalPosition: { ...entity.position },
        distanceTravelled: 0,
        collided: false,
        immunityActive: true,
      };
    }

    const direction = normalize(options.direction);
    let travelled = 0;
    let collided = false;
    let position = { ...entity.position };

    while (travelled < options.meters) {
      const step = Math.min(stepSize, options.meters - travelled);
      const nextPosition = {
        x: position.x + direction.x * step,
        y: position.y + direction.y * step,
        z: position.z + direction.z * step,
      };
      if (environment.isObstructed(nextPosition, entity.radius)) {
        collided = true;
        break;
      }
      position = nextPosition;
      travelled += step;
    }

    this.knockbackImmunityUntil.set(
      entity.id,
      options.currentTime + immunityMs / 1000
    );

    return {
      applied: true,
      finalPosition: position,
      distanceTravelled: travelled,
      collided,
      immunityActive: false,
    };
  }

  private getDefaultDuration(status: StatusType): number {
    const entry = this.statusDefaults[status as keyof typeof DEFAULT_STATUS_TUNING];
    if (entry && "dur" in entry) {
      return entry.dur as number;
    }
    return 0;
  }

  private getDefaultPotency(status: StatusType): number {
    const entry = this.statusDefaults[status as keyof typeof DEFAULT_STATUS_TUNING];
    if (!entry) {
      return 0;
    }
    if ("pctOverTime" in entry) {
      return entry.pctOverTime as number;
    }
    if ("drPctPerStack" in entry) {
      return entry.drPctPerStack as number;
    }
    if ("chance" in entry) {
      return entry.chance as number;
    }
    if ("meters" in entry) {
      return entry.meters as number;
    }
    return 0;
  }

  private getDefaultMaxStacks(status: StatusType): number {
    const entry = this.statusDefaults[status as keyof typeof DEFAULT_STATUS_TUNING];
    if (entry && "stacksMax" in entry) {
      return entry.stacksMax as number;
    }
    return 1;
  }

  private ensureBucket(entityId: string): StatusBucket {
    let bucket = this.buckets.get(entityId);
    if (!bucket) {
      bucket = { instances: new Map(), uptime: new Map() };
      this.buckets.set(entityId, bucket);
    }
    return bucket;
  }

  private markUptimeStart(bucket: StatusBucket, status: StatusType, time: number) {
    const entry = bucket.uptime.get(status) ?? { accumulated: 0 };
    if (entry.activeSince === undefined) {
      entry.activeSince = time;
    }
    bucket.uptime.set(status, entry);
  }

  private markUptimeStop(bucket: StatusBucket, status: StatusType, time: number) {
    const entry = bucket.uptime.get(status);
    if (!entry) {
      return;
    }
    if (entry.activeSince !== undefined) {
      entry.accumulated += time - entry.activeSince;
      entry.activeSince = undefined;
    }
  }
}

function normalize(v: Vector3Like): Vector3Like {
  const length = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
  if (length === 0) {
    return { x: 0, y: 0, z: 0 };
  }
  return { x: v.x / length, y: v.y / length, z: v.z / length };
}
