"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.executeMovement = executeMovement;
function executeMovement(actor, request, environment) {
    var _a, _b, _c, _d, _e, _f;
    const action = request.action;
    const options = (_a = request.options) !== null && _a !== void 0 ? _a : {};
    const fixedDelta = Math.max(1 / 120, (_b = options.fixedDelta) !== null && _b !== void 0 ? _b : 1 / 60);
    const maxTime = (_c = options.maxTime) !== null && _c !== void 0 ? _c : 10;
    const frames = [];
    let collided = false;
    let cancelled = false;
    const context = { actor, action: request };
    (_d = environment.onMovementStart) === null || _d === void 0 ? void 0 : _d.call(environment, context);
    switch (action.type) {
        case "dash": {
            const direction = resolveDirection(actor, action.targeting, options);
            const duration = action.speed <= 0 ? 0 : action.distance / action.speed;
            simulateLinear(actor, direction, action.distance, action.speed, fixedDelta, maxTime, environment, frames, false, action.stopOnCollision, (hit) => {
                collided = hit;
                if (hit && action.stopOnCollision) {
                    cancelled = true;
                }
            }, request);
            break;
        }
        case "leap": {
            const direction = resolveDirection(actor, action.targeting, options);
            const speed = action.airtime <= 0 ? 0 : Math.max(0, action.distance) / action.airtime;
            simulateLinear(actor, direction, action.distance, speed, fixedDelta, Math.min(maxTime, action.airtime + 1), environment, frames, true, !action.allowPassThrough, (hit) => {
                collided = hit && !action.allowPassThrough;
            }, request);
            break;
        }
        case "lunge": {
            const target = options.targetPosition;
            const direction = target
                ? normalize(subtract(target, actor.position))
                : normalize(actor.facing);
            const distance = Math.min(action.maxDistance, target ? distanceBetween(actor.position, target) : action.maxDistance);
            simulateLinear(actor, direction, distance, action.speed, fixedDelta, maxTime, environment, frames, false, true, (hit) => {
                collided = hit;
                if (hit && action.stickToTarget) {
                    cancelled = true;
                }
            }, request);
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
    const finalFrame = (_e = frames[frames.length - 1]) !== null && _e !== void 0 ? _e : {
        time: 0,
        position: { ...actor.position },
        velocity: { x: 0, y: 0, z: 0 },
        airborne: false,
    };
    const result = {
        frames,
        finalPosition: finalFrame.position,
        duration: finalFrame.time,
        collided,
        cancelled,
    };
    (_f = environment.onMovementEnd) === null || _f === void 0 ? void 0 : _f.call(environment, context, result);
    return result;
}
function simulateLinear(actor, direction, distance, speed, fixedDelta, maxTime, environment, frames, airborne, stopOnCollision, onCollision, request) {
    var _a;
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
        }
        else {
            onCollision(false);
        }
        const frame = {
            time,
            position: { ...position },
            velocity: { ...velocity },
            airborne,
        };
        frames.push(frame);
        (_a = environment.onMovementStep) === null || _a === void 0 ? void 0 : _a.call(environment, { actor, action: request }, frame);
    }
}
function resolveDirection(actor, targeting, options) {
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
function add(a, b) {
    return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}
function subtract(a, b) {
    return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}
function scale(v, s) {
    return { x: v.x * s, y: v.y * s, z: v.z * s };
}
function length(v) {
    return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
}
function normalize(v) {
    const len = length(v);
    if (len === 0) {
        return { x: 0, y: 0, z: 0 };
    }
    return scale(v, 1 / len);
}
function distanceBetween(a, b) {
    return length(subtract(a, b));
}
