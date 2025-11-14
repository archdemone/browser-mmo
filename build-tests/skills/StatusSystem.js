"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.StatusSystem = void 0;
const StatusTuning_1 = require("../config/StatusTuning");
const DEFAULT_STEP_SIZE = 0.1;
class StatusSystem {
    constructor(statusPolicies = StatusTuning_1.STATUS_POLICIES, statusDefaults = StatusTuning_1.DEFAULT_STATUS_TUNING) {
        Object.defineProperty(this, "statusPolicies", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: statusPolicies
        });
        Object.defineProperty(this, "statusDefaults", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: statusDefaults
        });
        Object.defineProperty(this, "buckets", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: new Map()
        });
        Object.defineProperty(this, "knockbackImmunityUntil", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: new Map()
        });
    }
    applyStatus(entityId, status, params, currentTime) {
        var _a, _b, _c, _d, _e, _f, _g, _h;
        const bucket = this.ensureBucket(entityId);
        const existing = bucket.instances.get(status);
        const policy = (_a = this.statusPolicies[status]) !== null && _a !== void 0 ? _a : {
            stacking: "refresh",
            maxStacks: (_b = params.maxStacksOverride) !== null && _b !== void 0 ? _b : 1,
            refreshDurationOnReapply: true,
        };
        const baseDuration = (_c = params.duration) !== null && _c !== void 0 ? _c : this.getDefaultDuration(status);
        const potency = (_d = params.potency) !== null && _d !== void 0 ? _d : this.getDefaultPotency(status);
        const maxStacks = (_f = (_e = params.maxStacksOverride) !== null && _e !== void 0 ? _e : policy.maxStacks) !== null && _f !== void 0 ? _f : this.getDefaultMaxStacks(status);
        const addStacks = (_g = params.addStacks) !== null && _g !== void 0 ? _g : 1;
        if (!existing) {
            const instance = {
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
        if (!((_h = bucket.uptime.get(status)) === null || _h === void 0 ? void 0 : _h.activeSince)) {
            this.markUptimeStart(bucket, status, currentTime);
        }
        return { ...existing };
    }
    tick(currentTime, entityId) {
        const expired = [];
        const entries = entityId
            ? [[entityId, this.buckets.get(entityId)]]
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
    removeStatus(entityId, status, currentTime) {
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
    getStatus(entityId, status) {
        const bucket = this.buckets.get(entityId);
        const instance = bucket === null || bucket === void 0 ? void 0 : bucket.instances.get(status);
        return instance ? { ...instance } : undefined;
    }
    getStatuses(entityId) {
        const bucket = this.buckets.get(entityId);
        if (!bucket) {
            return [];
        }
        return Array.from(bucket.instances.values()).map((instance) => ({ ...instance }));
    }
    getUptime(entityId, status, currentTime) {
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
    clearEntity(entityId) {
        this.buckets.delete(entityId);
        this.knockbackImmunityUntil.delete(entityId);
    }
    applyKnockback(entity, options, environment) {
        var _a, _b, _c, _d, _e;
        const stepSize = (_a = options.stepSize) !== null && _a !== void 0 ? _a : DEFAULT_STEP_SIZE;
        const immunityMs = (_b = options.immunityMs) !== null && _b !== void 0 ? _b : ((_d = (_c = this.statusDefaults.knockback) === null || _c === void 0 ? void 0 : _c.immunityMs) !== null && _d !== void 0 ? _d : 0);
        const immunityUntil = (_e = this.knockbackImmunityUntil.get(entity.id)) !== null && _e !== void 0 ? _e : 0;
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
        this.knockbackImmunityUntil.set(entity.id, options.currentTime + immunityMs / 1000);
        return {
            applied: true,
            finalPosition: position,
            distanceTravelled: travelled,
            collided,
            immunityActive: false,
        };
    }
    getDefaultDuration(status) {
        const entry = this.statusDefaults[status];
        if (entry && "dur" in entry) {
            return entry.dur;
        }
        return 0;
    }
    getDefaultPotency(status) {
        const entry = this.statusDefaults[status];
        if (!entry) {
            return 0;
        }
        if ("pctOverTime" in entry) {
            return entry.pctOverTime;
        }
        if ("drPctPerStack" in entry) {
            return entry.drPctPerStack;
        }
        if ("chance" in entry) {
            return entry.chance;
        }
        if ("meters" in entry) {
            return entry.meters;
        }
        return 0;
    }
    getDefaultMaxStacks(status) {
        const entry = this.statusDefaults[status];
        if (entry && "stacksMax" in entry) {
            return entry.stacksMax;
        }
        return 1;
    }
    ensureBucket(entityId) {
        let bucket = this.buckets.get(entityId);
        if (!bucket) {
            bucket = { instances: new Map(), uptime: new Map() };
            this.buckets.set(entityId, bucket);
        }
        return bucket;
    }
    markUptimeStart(bucket, status, time) {
        var _a;
        const entry = (_a = bucket.uptime.get(status)) !== null && _a !== void 0 ? _a : { accumulated: 0 };
        if (entry.activeSince === undefined) {
            entry.activeSince = time;
        }
        bucket.uptime.set(status, entry);
    }
    markUptimeStop(bucket, status, time) {
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
exports.StatusSystem = StatusSystem;
function normalize(v) {
    const length = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
    if (length === 0) {
        return { x: 0, y: 0, z: 0 };
    }
    return { x: v.x / length, y: v.y / length, z: v.z / length };
}
