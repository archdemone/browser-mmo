import assert from "node:assert/strict";
import { StatusSystem, KnockbackEntity } from "../StatusSystem";
import { MovementEnvironment } from "../MovementAPI";

const system = new StatusSystem();

function approxEqual(a: number, b: number, epsilon = 1e-3) {
  assert.ok(Math.abs(a - b) <= epsilon, `Expected ${a} ≈ ${b}`);
}

function testBleedStacks() {
  const entityId = "bleed-dummy";
  system.clearEntity(entityId);

  const first = system.applyStatus(entityId, "bleed", { potency: 1 }, 0);
  assert.equal(first.stacks, 1);
  assert.equal(first.maxStacks, 3);

  system.applyStatus(entityId, "bleed", { potency: 1 }, 1);
  const second = system.getStatus(entityId, "bleed");
  assert(second);
  assert.equal(second?.stacks, 2);

  system.applyStatus(entityId, "bleed", { potency: 1 }, 2);
  system.applyStatus(entityId, "bleed", { potency: 1 }, 3);
  const capped = system.getStatus(entityId, "bleed");
  assert(capped);
  assert.equal(capped?.stacks, 3, "Bleed stacks should clamp to 3");
}

function testStunRefresh() {
  const entityId = "stun-dummy";
  system.clearEntity(entityId);

  const first = system.applyStatus(entityId, "stun", {}, 0);
  assert(first);
  const baseDuration = first.expiresAt;

  const reapplied = system.applyStatus(entityId, "stun", {}, 0.3);
  assert(reapplied);
  assert(reapplied.expiresAt > baseDuration, "Stun should refresh duration");
  approxEqual(reapplied.expiresAt, 0.3 + 0.7, 1e-2);

  system.clearEntity(entityId);
}

function testTickRemovesExpired() {
  const entityId = "tick-dummy";
  system.clearEntity(entityId);
  system.applyStatus(entityId, "bleed", { duration: 1 }, 0);

  const expired = system.tick(1.1);
  assert.deepEqual(expired, [{ entityId, status: "bleed" }]);
  const remaining = system.getStatuses(entityId);
  assert.equal(remaining.length, 0);
}

function testKnockbackImmunity() {
  const entity: KnockbackEntity = {
    id: "knockback-dummy",
    position: { x: 0, y: 0, z: 0 },
    radius: 0.5,
  };
  const environment: MovementEnvironment = {
    isObstructed: () => false,
  };

  const result1 = system.applyKnockback(
    entity,
    { direction: { x: 1, y: 0, z: 0 }, meters: 2, currentTime: 0 },
    environment
  );
  assert.equal(result1.applied, true);
  assert.equal(result1.immunityActive, false);
  approxEqual(result1.distanceTravelled, 2);

  const result2 = system.applyKnockback(
    entity,
    { direction: { x: 1, y: 0, z: 0 }, meters: 2, currentTime: 0.1 },
    environment
  );
  assert.equal(result2.applied, false, "Knockback should respect immunity window");
  assert.equal(result2.immunityActive, true);

  const result3 = system.applyKnockback(
    entity,
    { direction: { x: 1, y: 0, z: 0 }, meters: 2, currentTime: 0.5 },
    environment
  );
  assert.equal(result3.applied, true, "Knockback should apply after immunity window");
}

function run() {
  testBleedStacks();
  testStunRefresh();
  testTickRemovesExpired();
  testKnockbackImmunity();
  console.log("StatusSystem tests passed.");
}

run();
