"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.spawnCircle = spawnCircle;
exports.spawnCone = spawnCone;
exports.spawnLine = spawnLine;
exports.spawnRing = spawnRing;
exports.spawnProjectile = spawnProjectile;
function vectorAdd(a, b) {
    return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}
function vectorSub(a, b) {
    return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}
function vectorScale(v, s) {
    return { x: v.x * s, y: v.y * s, z: v.z * s };
}
function vectorLength(v) {
    return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
}
function normalize(v) {
    const len = vectorLength(v);
    if (len === 0) {
        return { x: 0, y: 0, z: 0 };
    }
    return vectorScale(v, 1 / len);
}
function distance(a, b) {
    return vectorLength(vectorSub(a, b));
}
function dot(a, b) {
    return a.x * b.x + a.y * b.y + a.z * b.z;
}
function projectPointOntoSegment(point, start, end) {
    const ab = vectorSub(end, start);
    const abLenSq = dot(ab, ab);
    if (abLenSq === 0) {
        return { closest: start, t: 0 };
    }
    const t = Math.max(0, Math.min(1, dot(vectorSub(point, start), ab) / abLenSq));
    const closest = vectorAdd(start, vectorScale(ab, t));
    return { closest, t };
}
let volumeCounter = 0;
function uuid(prefix) {
    volumeCounter = (volumeCounter + 1) % Number.MAX_SAFE_INTEGER;
    return `${prefix}-${volumeCounter}`;
}
class CircleHitVolume {
    constructor(center, radius, startTime = 0, lifetime = 0) {
        Object.defineProperty(this, "center", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: center
        });
        Object.defineProperty(this, "radius", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: radius
        });
        Object.defineProperty(this, "id", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: uuid("circle")
        });
        Object.defineProperty(this, "type", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: "circle"
        });
        Object.defineProperty(this, "startTime", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "lifetime", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        this.startTime = startTime;
        this.lifetime = lifetime;
    }
    isExpired(time) {
        return time > this.startTime + this.lifetime;
    }
    overlapTest(entity) {
        return distance(entity.position, this.center) <= this.radius + entity.radius;
    }
    drawGizmo(emit) {
        emit({ type: "circle", center: this.center, radius: this.radius });
    }
}
class ConeHitVolume {
    constructor(origin, direction, angleDeg, range, startTime = 0, lifetime = 0) {
        Object.defineProperty(this, "origin", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: origin
        });
        Object.defineProperty(this, "angleDeg", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: angleDeg
        });
        Object.defineProperty(this, "range", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: range
        });
        Object.defineProperty(this, "id", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: uuid("cone")
        });
        Object.defineProperty(this, "type", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: "cone"
        });
        Object.defineProperty(this, "startTime", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "lifetime", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "direction", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "angleRad", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        this.direction = normalize(direction);
        this.angleRad = (angleDeg * Math.PI) / 180;
        this.startTime = startTime;
        this.lifetime = lifetime;
    }
    isExpired(time) {
        return time > this.startTime + this.lifetime;
    }
    overlapTest(entity) {
        const toEntity = vectorSub(entity.position, this.origin);
        const distanceToEntity = vectorLength(toEntity);
        if (distanceToEntity > this.range + entity.radius) {
            return false;
        }
        const normalized = distanceToEntity === 0 ? toEntity : vectorScale(toEntity, 1 / distanceToEntity);
        const angle = Math.acos(Math.max(-1, Math.min(1, dot(normalized, this.direction))));
        return angle <= this.angleRad / 2;
    }
    drawGizmo(emit) {
        emit({
            type: "cone",
            origin: this.origin,
            direction: this.direction,
            angle: this.angleDeg,
            range: this.range,
        });
    }
}
class LineHitVolume {
    constructor(start, direction, length, width, startTime = 0, lifetime = 0) {
        Object.defineProperty(this, "start", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: start
        });
        Object.defineProperty(this, "id", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: uuid("line")
        });
        Object.defineProperty(this, "type", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: "line"
        });
        Object.defineProperty(this, "startTime", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "lifetime", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "end", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "halfWidth", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        const dir = normalize(direction);
        this.end = vectorAdd(start, vectorScale(dir, length));
        this.halfWidth = width / 2;
        this.startTime = startTime;
        this.lifetime = lifetime;
    }
    isExpired(time) {
        return time > this.startTime + this.lifetime;
    }
    overlapTest(entity) {
        const { closest } = projectPointOntoSegment(entity.position, this.start, this.end);
        const dist = distance(entity.position, closest);
        return dist <= this.halfWidth + entity.radius;
    }
    drawGizmo(emit) {
        emit({
            type: "line",
            start: this.start,
            end: this.end,
            width: this.halfWidth * 2,
        });
    }
}
class RingHitVolume {
    constructor(center, inner, outer, startTime = 0, lifetime = 0) {
        Object.defineProperty(this, "center", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: center
        });
        Object.defineProperty(this, "inner", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: inner
        });
        Object.defineProperty(this, "outer", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: outer
        });
        Object.defineProperty(this, "id", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: uuid("ring")
        });
        Object.defineProperty(this, "type", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: "ring"
        });
        Object.defineProperty(this, "startTime", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "lifetime", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        this.startTime = startTime;
        this.lifetime = lifetime;
    }
    isExpired(time) {
        return time > this.startTime + this.lifetime;
    }
    overlapTest(entity) {
        const dist = distance(entity.position, this.center);
        return dist + entity.radius >= this.inner && dist - entity.radius <= this.outer;
    }
    drawGizmo(emit) {
        emit({
            type: "ring",
            center: this.center,
            inner: this.inner,
            outer: this.outer,
        });
    }
}
class SimpleProjectile {
    constructor(origin, direction, speed, lifetime, pierce = 0, chain = 0, radius = 0.5, onStep) {
        Object.defineProperty(this, "id", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: uuid("proj")
        });
        Object.defineProperty(this, "type", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: "projectile"
        });
        Object.defineProperty(this, "startTime", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "lifetime", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "pierce", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "chain", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "radius", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "position", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "velocity", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "onStep", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "timeAlive", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 0
        });
        Object.defineProperty(this, "trail", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: []
        });
        this.position = { ...origin };
        this.velocity = vectorScale(normalize(direction), speed);
        this.lifetime = lifetime;
        this.startTime = 0;
        this.pierce = pierce;
        this.chain = chain;
        this.radius = radius;
        this.onStep = onStep;
    }
    isExpired(time) {
        return time > this.lifetime;
    }
    advance(deltaSeconds) {
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
    overlapTest(entity) {
        return distance(this.position, entity.position) <= this.radius + entity.radius;
    }
    drawGizmo(emit) {
        emit({
            type: "projectile",
            position: this.position,
            radius: this.radius,
            trail: [...this.trail],
        });
    }
}
function spawnCircle(center, radius, startTime = 0, lifetime = 0) {
    return new CircleHitVolume(center, radius, startTime, lifetime);
}
function spawnCone(origin, direction, angle, range, startTime = 0, lifetime = 0) {
    return new ConeHitVolume(origin, direction, angle, range, startTime, lifetime);
}
function spawnLine(start, direction, length, width, startTime = 0, lifetime = 0) {
    return new LineHitVolume(start, direction, length, width, startTime, lifetime);
}
function spawnRing(center, inner, outer, startTime = 0, lifetime = 0) {
    return new RingHitVolume(center, inner, outer, startTime, lifetime);
}
function spawnProjectile(params) {
    var _a, _b;
    const direction = normalize(params.direction);
    const radius = (_a = params.radius) !== null && _a !== void 0 ? _a : 0.5;
    const spreadAngle = (_b = params.spreadAngleDeg) !== null && _b !== void 0 ? _b : 8;
    const projectiles = [];
    if (params.count <= 1) {
        projectiles.push(new SimpleProjectile(params.origin, direction, params.speed, params.lifetime, params.pierce, params.chain, radius, params.onStep));
        return projectiles;
    }
    const half = (params.count - 1) / 2;
    for (let i = 0; i < params.count; i++) {
        const offset = i - half;
        const angleRad = ((spreadAngle * offset) * Math.PI) / 180;
        const rotated = rotateY(direction, angleRad);
        projectiles.push(new SimpleProjectile(params.origin, rotated, params.speed, params.lifetime, params.pierce, params.chain, radius, params.onStep));
    }
    return projectiles;
}
function rotateY(direction, angleRad) {
    const cos = Math.cos(angleRad);
    const sin = Math.sin(angleRad);
    return {
        x: direction.x * cos - direction.z * sin,
        y: direction.y,
        z: direction.x * sin + direction.z * cos,
    };
}
