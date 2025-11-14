import { Vector3Like } from "./HitGeometry";
import { MovementAction } from "./skills.schema";

export interface MovementEnvironment {
  /**
   * Returns true when the provided position would collide with world geometry.
   */
  isObstructed(position: Vector3Like, radius: number): boolean;
  onMovementStart?(context: MovementEventContext): void;
  onMovementStep?(context: MovementEventContext, frame: MovementFrame): void;
  onMovementEnd?(context: MovementEventContext, result: MovementResult): void;
}

export interface MovementActor {
  id: string;
  position: Vector3Like;
  facing: Vector3Like;
  radius: number;
}

export interface MovementEventContext {
  actor: MovementActor;
  action: MovementActionRequest;
}

export interface MovementFrame {
  time: number;
  position: Vector3Like;
  velocity: Vector3Like;
  airborne: boolean;
}

export interface MovementResult {
  frames: MovementFrame[];
  finalPosition: Vector3Like;
  duration: number;
  collided: boolean;
  cancelled: boolean;
}

export interface MovementOptions {
  fixedDelta?: number;
  maxTime?: number;
  targetPosition?: Vector3Like;
  cursorPosition?: Vector3Like;
}

export interface MovementActionRequest {
  action: MovementAction;
  options?: MovementOptions;
}

export function executeMovement(
  actor: MovementActor,
  request: MovementActionRequest,
  environment: MovementEnvironment
): MovementResult {
  const action = request.action;
  const options = request.options ?? {};
  const fixedDelta = Math.max(1 / 120, options.fixedDelta ?? 1 / 60);
  const maxTime = options.maxTime ?? 10;

  const frames: MovementFrame[] = [];
  let collided = false;
  let cancelled = false;

  const context: MovementEventContext = { actor, action: request };
  environment.onMovementStart?.(context);

  switch (action.type) {
    case "dash": {
      const direction = resolveDirection(actor, action.targeting, options);
      const duration = action.speed <= 0 ? 0 : action.distance / action.speed;
      simulateLinear(
        actor,
        direction,
        action.distance,
        action.speed,
        fixedDelta,
        maxTime,
        environment,
        frames,
        false,
        action.stopOnCollision,
        (hit) => {
          collided = hit;
          if (hit && action.stopOnCollision) {
            cancelled = true;
          }
        },
        request
      );
      break;
    }
    case "leap": {
      const direction = resolveDirection(actor, action.targeting, options);
      const speed =
        action.airtime <= 0 ? 0 : Math.max(0, action.distance) / action.airtime;
      simulateLinear(
        actor,
        direction,
        action.distance,
        speed,
        fixedDelta,
        Math.min(maxTime, action.airtime + 1),
        environment,
        frames,
        true,
        !action.allowPassThrough,
        (hit) => {
          collided = hit && !action.allowPassThrough;
        },
        request
      );
      break;
    }
    case "lunge": {
      const target = options.targetPosition;
      const direction = target
        ? normalize(subtract(target, actor.position))
        : normalize(actor.facing);
      const distance = Math.min(
        action.maxDistance,
        target ? distanceBetween(actor.position, target) : action.maxDistance
      );
      simulateLinear(
        actor,
        direction,
        distance,
        action.speed,
        fixedDelta,
        maxTime,
        environment,
        frames,
        false,
        true,
        (hit) => {
          collided = hit;
          if (hit && action.stickToTarget) {
            cancelled = true;
          }
        },
        request
      );
      break;
    }
    case "custom": {
      cancelled = true;
      frames.push({
        time: 0,
        position: { ...actor.position },
        velocity: { x: 0, y: 0, z: 0 },
        airborne: false,
      });
      break;
    }
  }

  const finalFrame = frames[frames.length - 1] ?? {
    time: 0,
    position: { ...actor.position },
    velocity: { x: 0, y: 0, z: 0 },
    airborne: false,
  };

  const result: MovementResult = {
    frames,
    finalPosition: finalFrame.position,
    duration: finalFrame.time,
    collided,
    cancelled,
  };

  environment.onMovementEnd?.(context, result);
  return result;
}

function simulateLinear(
  actor: MovementActor,
  direction: Vector3Like,
  distance: number,
  speed: number,
  fixedDelta: number,
  maxTime: number,
  environment: MovementEnvironment,
  frames: MovementFrame[],
  airborne: boolean,
  stopOnCollision: boolean,
  onCollision: (hit: boolean) => void,
  request: MovementActionRequest
) {
  let travelled = 0;
  let time = 0;
  const velocity = scale(direction, speed);
  let position = { ...actor.position };
  frames.push({
    time,
    position: { ...position },
    velocity: { ...velocity },
    airborne,
  });

  while (travelled < distance && time < maxTime) {
    const step = Math.min(fixedDelta, (distance - travelled) / (speed || 1));
    time += step;
    position = add(position, scale(direction, speed * step));
    travelled += speed * step;

    if (environment.isObstructed(position, actor.radius)) {
      onCollision(true);
      if (stopOnCollision) {
        break;
      }
    } else {
      onCollision(false);
    }

    const frame: MovementFrame = {
      time,
      position: { ...position },
      velocity: { ...velocity },
      airborne,
    };
    frames.push(frame);
    environment.onMovementStep?.({ actor, action: request }, frame);
  }
}

function resolveDirection(
  actor: MovementActor,
  targeting: "forward" | "cursor" | "target",
  options: MovementOptions
): Vector3Like {
  switch (targeting) {
    case "cursor":
      if (options.cursorPosition) {
        return normalize(subtract(options.cursorPosition, actor.position));
      }
      return normalize(actor.facing);
    case "target":
      if (options.targetPosition) {
        return normalize(subtract(options.targetPosition, actor.position));
      }
      return normalize(actor.facing);
    default:
      return normalize(actor.facing);
  }
}

function add(a: Vector3Like, b: Vector3Like): Vector3Like {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

function subtract(a: Vector3Like, b: Vector3Like): Vector3Like {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function scale(v: Vector3Like, s: number): Vector3Like {
  return { x: v.x * s, y: v.y * s, z: v.z * s };
}

function length(v: Vector3Like): number {
  return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
}

function normalize(v: Vector3Like): Vector3Like {
  const len = length(v);
  if (len === 0) {
    return { x: 0, y: 0, z: 0 };
  }
  return scale(v, 1 / len);
}

function distanceBetween(a: Vector3Like, b: Vector3Like): number {
  return length(subtract(a, b));
}
