"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const StatusSystem_1 = require("../StatusSystem");
const system = new StatusSystem_1.StatusSystem();
function approxEqual(a, b, epsilon = 1e-3) {
    strict_1.default.ok(Math.abs(a - b) <= epsilon, `Expected ${a} ≈ ${b}`);
}
function testBleedStacks() {
    const entityId = "bleed-dummy";
    system.clearEntity(entityId);
    const first = system.applyStatus(entityId, "bleed", { potency: 1 }, 0);
    strict_1.default.equal(first.stacks, 1);
    strict_1.default.equal(first.maxStacks, 3);
    system.applyStatus(entityId, "bleed", { potency: 1 }, 1);
    const second = system.getStatus(entityId, "bleed");
    (0, strict_1.default)(second);
    strict_1.default.equal(second === null || second === void 0 ? void 0 : second.stacks, 2);
    system.applyStatus(entityId, "bleed", { potency: 1 }, 2);
    system.applyStatus(entityId, "bleed", { potency: 1 }, 3);
    const capped = system.getStatus(entityId, "bleed");
    (0, strict_1.default)(capped);
    strict_1.default.equal(capped === null || capped === void 0 ? void 0 : capped.stacks, 3, "Bleed stacks should clamp to 3");
}
function testStunRefresh() {
    const entityId = "stun-dummy";
    system.clearEntity(entityId);
    const first = system.applyStatus(entityId, "stun", {}, 0);
    (0, strict_1.default)(first);
    const baseDuration = first.expiresAt;
    const reapplied = system.applyStatus(entityId, "stun", {}, 0.3);
    (0, strict_1.default)(reapplied);
    (0, strict_1.default)(reapplied.expiresAt > baseDuration, "Stun should refresh duration");
    approxEqual(reapplied.expiresAt, 0.3 + 0.7, 1e-2);
    system.clearEntity(entityId);
}
function testTickRemovesExpired() {
    const entityId = "tick-dummy";
    system.clearEntity(entityId);
    system.applyStatus(entityId, "bleed", { duration: 1 }, 0);
    const expired = system.tick(1.1);
    strict_1.default.deepEqual(expired, [{ entityId, status: "bleed" }]);
    const remaining = system.getStatuses(entityId);
    strict_1.default.equal(remaining.length, 0);
}
function testKnockbackImmunity() {
    const entity = {
        id: "knockback-dummy",
        position: { x: 0, y: 0, z: 0 },
        radius: 0.5,
    };
    const environment = {
        isObstructed: () => false,
    };
    const result1 = system.applyKnockback(entity, { direction: { x: 1, y: 0, z: 0 }, meters: 2, currentTime: 0 }, environment);
    strict_1.default.equal(result1.applied, true);
    strict_1.default.equal(result1.immunityActive, false);
    approxEqual(result1.distanceTravelled, 2);
    const result2 = system.applyKnockback(entity, { direction: { x: 1, y: 0, z: 0 }, meters: 2, currentTime: 0.1 }, environment);
    strict_1.default.equal(result2.applied, false, "Knockback should respect immunity window");
    strict_1.default.equal(result2.immunityActive, true);
    const result3 = system.applyKnockback(entity, { direction: { x: 1, y: 0, z: 0 }, meters: 2, currentTime: 0.5 }, environment);
    strict_1.default.equal(result3.applied, true, "Knockback should apply after immunity window");
}
function run() {
    testBleedStacks();
    testStunRefresh();
    testTickRemovesExpired();
    testKnockbackImmunity();
    console.log("StatusSystem tests passed.");
}
run();
