export interface CastMetrics {
  castId: string;
  startedAt: number;
  endedAt?: number;
  damage: number;
  hits: number;
}

export interface DamageEvent {
  castId: string;
  targetId: string;
  componentId: string;
  amount: number;
  time: number;
}

export interface KillEvent {
  castId: string;
  targetId: string;
  time: number;
}

export interface SkillMetricsConfig {
  damageWindowSeconds: number;
  ttkSampleSize: number;
}

const DEFAULT_CONFIG: SkillMetricsConfig = {
  damageWindowSeconds: 5,
  ttkSampleSize: 3,
};

export class SkillMetrics {
  private readonly damageEvents: DamageEvent[] = [];
  private readonly killDurations: number[] = [];
  private readonly casts = new Map<string, CastMetrics>();

  constructor(private readonly config: SkillMetricsConfig = DEFAULT_CONFIG) {}

  beginCast(castId: string, time: number): void {
    this.casts.set(castId, {
      castId,
      startedAt: time,
      damage: 0,
      hits: 0,
    });
  }

  endCast(castId: string, time: number): void {
    const cast = this.casts.get(castId);
    if (cast) {
      cast.endedAt = time;
    }
  }

  reset(): void {
    this.damageEvents.length = 0;
    this.killDurations.length = 0;
    this.casts.clear();
  }

  recordDamage(event: DamageEvent): void {
    const cast = this.casts.get(event.castId);
    if (cast) {
      cast.damage += event.amount;
      cast.hits += 1;
    }
    this.damageEvents.push(event);
    this.pruneDamage(event.time);
  }

  recordKill(event: KillEvent): void {
    const cast = this.casts.get(event.castId);
    if (!cast) {
      return;
    }
    const duration = event.time - cast.startedAt;
    this.killDurations.push(duration);
    if (this.killDurations.length > this.config.ttkSampleSize) {
      this.killDurations.shift();
    }
  }

  getRollingDps(currentTime: number): number {
    this.pruneDamage(currentTime);
    const windowStart = currentTime - this.config.damageWindowSeconds;
    const damageInWindow = this.damageEvents
      .filter((event) => event.time >= windowStart)
      .reduce((sum, event) => sum + event.amount, 0);
    const windowDuration = Math.max(this.config.damageWindowSeconds, 0.0001);
    return damageInWindow / windowDuration;
  }

  getRollingHitCount(currentTime: number): number {
    this.pruneDamage(currentTime);
    const windowStart = currentTime - this.config.damageWindowSeconds;
    return this.damageEvents.filter((event) => event.time >= windowStart).length;
  }

  getAverageTtk(): number | null {
    if (this.killDurations.length === 0) {
      return null;
    }
    const total = this.killDurations.reduce((sum, duration) => sum + duration, 0);
    return total / this.killDurations.length;
  }

  getCastSummary(castId: string): CastMetrics | undefined {
    const cast = this.casts.get(castId);
    return cast
      ? {
          castId: cast.castId,
          startedAt: cast.startedAt,
          endedAt: cast.endedAt,
          damage: cast.damage,
          hits: cast.hits,
        }
      : undefined;
  }

  private pruneDamage(currentTime: number): void {
    const threshold = currentTime - this.config.damageWindowSeconds;
    while (
      this.damageEvents.length > 0 &&
      this.damageEvents[0].time < threshold
    ) {
      this.damageEvents.shift();
    }
  }
}

