export interface Vector3Like {
  x: number;
  y: number;
  z: number;
}

export interface HitTestEntity {
  id: string;
  position: Vector3Like;
  radius: number;
}

export type GizmoCommand =
  | { type: "circle"; center: Vector3Like; radius: number; color?: string }
  | {
      type: "cone";
      origin: Vector3Like;
      direction: Vector3Like;
      angle: number;
      range: number;
      color?: string;
    }
  | {
      type: "line";
      start: Vector3Like;
      end: Vector3Like;
      width: number;
      color?: string;
    }
  | {
      type: "ring";
      center: Vector3Like;
      inner: number;
      outer: number;
      color?: string;
    }
  | {
      type: "projectile";
      position: Vector3Like;
      radius: number;
      trail?: Vector3Like[];
      color?: string;
    };

export type GizmoEmitter = (command: GizmoCommand) => void;

export interface HitVolume {
  readonly id: string;
  readonly type: string;
  readonly startTime: number;
  readonly lifetime: number;
  isExpired(time: number): boolean;
  overlapTest(entity: HitTestEntity): boolean;
  drawGizmo?(emit: GizmoEmitter): void;
}

export interface ProjectileParams {
  origin: Vector3Like;
  direction: Vector3Like;
  speed: number;
  lifetime: number;
  count: number;
  pierce?: number;
  chain?: number;
  radius?: number;
  spreadAngleDeg?: number;
  onStep?: (frame: ProjectileFrame) => void;
}

export interface ProjectileFrame {
  projectileId: string;
  position: Vector3Like;
  velocity: Vector3Like;
  time: number;
}

export interface ProjectileVolume extends HitVolume {
  readonly pierce: number;
  readonly chain: number;
  readonly radius: number;
  advance(deltaSeconds: number): void;
  position: Vector3Like;
  velocity: Vector3Like;
}

function vectorAdd(a: Vector3Like, b: Vector3Like): Vector3Like {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

function vectorSub(a: Vector3Like, b: Vector3Like): Vector3Like {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function vectorScale(v: Vector3Like, s: number): Vector3Like {
  return { x: v.x * s, y: v.y * s, z: v.z * s };
}

function vectorLength(v: Vector3Like): number {
  return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
}

function normalize(v: Vector3Like): Vector3Like {
  const len = vectorLength(v);
  if (len === 0) {
    return { x: 0, y: 0, z: 0 };
  }
  return vectorScale(v, 1 / len);
}

function distance(a: Vector3Like, b: Vector3Like): number {
  return vectorLength(vectorSub(a, b));
}

function dot(a: Vector3Like, b: Vector3Like): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function projectPointOntoSegment(
  point: Vector3Like,
  start: Vector3Like,
  end: Vector3Like
): { closest: Vector3Like; t: number } {
  const ab = vectorSub(end, start);
  const abLenSq = dot(ab, ab);
  if (abLenSq === 0) {
    return { closest: start, t: 0 };
  }
  const t = Math.max(
    0,
    Math.min(1, dot(vectorSub(point, start), ab) / abLenSq)
  );
  const closest = vectorAdd(start, vectorScale(ab, t));
  return { closest, t };
}

let volumeCounter = 0;
function uuid(prefix: string): string {
  volumeCounter = (volumeCounter + 1) % Number.MAX_SAFE_INTEGER;
  return `${prefix}-${volumeCounter}`;
}

class CircleHitVolume implements HitVolume {
  readonly id = uuid("circle");
  readonly type = "circle";
  readonly startTime: number;
  readonly lifetime: number;
  constructor(
    private readonly center: Vector3Like,
    private readonly radius: number,
    startTime = 0,
    lifetime = 0
  ) {
    this.startTime = startTime;
    this.lifetime = lifetime;
  }

  isExpired(time: number): boolean {
    return time > this.startTime + this.lifetime;
  }

  overlapTest(entity: HitTestEntity): boolean {
    return distance(entity.position, this.center) <= this.radius + entity.radius;
  }

  drawGizmo(emit: GizmoEmitter): void {
    emit({ type: "circle", center: this.center, radius: this.radius });
  }
}

class ConeHitVolume implements HitVolume {
  readonly id = uuid("cone");
  readonly type = "cone";
  readonly startTime: number;
  readonly lifetime: number;
  private readonly direction: Vector3Like;
  private readonly angleRad: number;

  constructor(
    private readonly origin: Vector3Like,
    direction: Vector3Like,
    private readonly angleDeg: number,
    private readonly range: number,
    startTime = 0,
    lifetime = 0
  ) {
    this.direction = normalize(direction);
    this.angleRad = (angleDeg * Math.PI) / 180;
    this.startTime = startTime;
    this.lifetime = lifetime;
  }

  isExpired(time: number): boolean {
    return time > this.startTime + this.lifetime;
  }

  overlapTest(entity: HitTestEntity): boolean {
    const toEntity = vectorSub(entity.position, this.origin);
    const distanceToEntity = vectorLength(toEntity);
    if (distanceToEntity > this.range + entity.radius) {
      return false;
    }
    const normalized = distanceToEntity === 0 ? toEntity : vectorScale(toEntity, 1 / distanceToEntity);
    const angle = Math.acos(Math.max(-1, Math.min(1, dot(normalized, this.direction))));
    return angle <= this.angleRad / 2;
  }

  drawGizmo(emit: GizmoEmitter): void {
    emit({
      type: "cone",
      origin: this.origin,
      direction: this.direction,
      angle: this.angleDeg,
      range: this.range,
    });
  }
}

class LineHitVolume implements HitVolume {
  readonly id = uuid("line");
  readonly type = "line";
  readonly startTime: number;
  readonly lifetime: number;
  private readonly end: Vector3Like;
  private readonly halfWidth: number;

  constructor(
    private readonly start: Vector3Like,
    direction: Vector3Like,
    length: number,
    width: number,
    startTime = 0,
    lifetime = 0
  ) {
    const dir = normalize(direction);
    this.end = vectorAdd(start, vectorScale(dir, length));
    this.halfWidth = width / 2;
    this.startTime = startTime;
    this.lifetime = lifetime;
  }

  isExpired(time: number): boolean {
    return time > this.startTime + this.lifetime;
  }

  overlapTest(entity: HitTestEntity): boolean {
    const { closest } = projectPointOntoSegment(entity.position, this.start, this.end);
    const dist = distance(entity.position, closest);
    return dist <= this.halfWidth + entity.radius;
  }

  drawGizmo(emit: GizmoEmitter): void {
    emit({
      type: "line",
      start: this.start,
      end: this.end,
      width: this.halfWidth * 2,
    });
  }
}

class RingHitVolume implements HitVolume {
  readonly id = uuid("ring");
  readonly type = "ring";
  readonly startTime: number;
  readonly lifetime: number;
  constructor(
    private readonly center: Vector3Like,
    private readonly inner: number,
    private readonly outer: number,
    startTime = 0,
    lifetime = 0
  ) {
    this.startTime = startTime;
    this.lifetime = lifetime;
  }

  isExpired(time: number): boolean {
    return time > this.startTime + this.lifetime;
  }

  overlapTest(entity: HitTestEntity): boolean {
    const dist = distance(entity.position, this.center);
    return dist + entity.radius >= this.inner && dist - entity.radius <= this.outer;
  }

  drawGizmo(emit: GizmoEmitter): void {
    emit({
      type: "ring",
      center: this.center,
      inner: this.inner,
      outer: this.outer,
    });
  }
}

class SimpleProjectile implements ProjectileVolume {
  readonly id = uuid("proj");
  readonly type = "projectile";
  readonly startTime: number;
  readonly lifetime: number;
  readonly pierce: number;
  readonly chain: number;
  readonly radius: number;
  position: Vector3Like;
  velocity: Vector3Like;
  private readonly onStep?: (frame: ProjectileFrame) => void;
  private timeAlive = 0;
  private readonly trail: Vector3Like[] = [];

  constructor(
    origin: Vector3Like,
    direction: Vector3Like,
    speed: number,
    lifetime: number,
    pierce = 0,
    chain = 0,
    radius = 0.5,
    onStep?: (frame: ProjectileFrame) => void
  ) {
    this.position = { ...origin };
    this.velocity = vectorScale(normalize(direction), speed);
    this.lifetime = lifetime;
    this.startTime = 0;
    this.pierce = pierce;
    this.chain = chain;
    this.radius = radius;
    this.onStep = onStep;
  }

  isExpired(time: number): boolean {
    return time > this.lifetime;
  }

  advance(deltaSeconds: number): void {
    this.timeAlive += deltaSeconds;
    if (this.timeAlive > this.lifetime) {
      return;
    }
    this.position = vectorAdd(this.position, vectorScale(this.velocity, deltaSeconds));
    if (this.onStep) {
      this.onStep({
        projectileId: this.id,
        position: { ...this.position },
        velocity: { ...this.velocity },
        time: this.timeAlive,
      });
    }
    this.trail.push({ ...this.position });
    if (this.trail.length > 10) {
      this.trail.shift();
    }
  }

  overlapTest(entity: HitTestEntity): boolean {
    return distance(this.position, entity.position) <= this.radius + entity.radius;
  }

  drawGizmo(emit: GizmoEmitter): void {
    emit({
      type: "projectile",
      position: this.position,
      radius: this.radius,
      trail: [...this.trail],
    });
  }
}

export function spawnCircle(
  center: Vector3Like,
  radius: number,
  startTime = 0,
  lifetime = 0
): HitVolume {
  return new CircleHitVolume(center, radius, startTime, lifetime);
}

export function spawnCone(
  origin: Vector3Like,
  direction: Vector3Like,
  angle: number,
  range: number,
  startTime = 0,
  lifetime = 0
): HitVolume {
  return new ConeHitVolume(origin, direction, angle, range, startTime, lifetime);
}

export function spawnLine(
  start: Vector3Like,
  direction: Vector3Like,
  length: number,
  width: number,
  startTime = 0,
  lifetime = 0
): HitVolume {
  return new LineHitVolume(start, direction, length, width, startTime, lifetime);
}

export function spawnRing(
  center: Vector3Like,
  inner: number,
  outer: number,
  startTime = 0,
  lifetime = 0
): HitVolume {
  return new RingHitVolume(center, inner, outer, startTime, lifetime);
}

export function spawnProjectile(params: ProjectileParams): ProjectileVolume[] {
  const direction = normalize(params.direction);
  const radius = params.radius ?? 0.5;
  const spreadAngle = params.spreadAngleDeg ?? 8;
  const projectiles: ProjectileVolume[] = [];

  if (params.count <= 1) {
    projectiles.push(
      new SimpleProjectile(
        params.origin,
        direction,
        params.speed,
        params.lifetime,
        params.pierce,
        params.chain,
        radius,
        params.onStep
      )
    );
    return projectiles;
  }

  const half = (params.count - 1) / 2;
  for (let i = 0; i < params.count; i++) {
    const offset = i - half;
    const angleRad = ((spreadAngle * offset) * Math.PI) / 180;
    const rotated = rotateY(direction, angleRad);
    projectiles.push(
      new SimpleProjectile(
        params.origin,
        rotated,
        params.speed,
        params.lifetime,
        params.pierce,
        params.chain,
        radius,
        params.onStep
      )
    );
  }

  return projectiles;
}

function rotateY(direction: Vector3Like, angleRad: number): Vector3Like {
  const cos = Math.cos(angleRad);
  const sin = Math.sin(angleRad);
  return {
    x: direction.x * cos - direction.z * sin,
    y: direction.y,
    z: direction.x * sin + direction.z * cos,
  };
}
