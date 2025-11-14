import {
  cloneSkillData,
  CURRENT_SKILL_SCHEMA_VERSION,
  SkillData,
} from "./skills.schema";

type SkillRegistryStore = Map<string, SkillData>;

const store: SkillRegistryStore = new Map();

const defaultSkills: SkillData[] = [
  {
    schemaVersion: CURRENT_SKILL_SCHEMA_VERSION,
    id: "warrior-heavy-strike",
    name: "Heavy Strike",
    levelReq: 1,
    tags: ["melee", "physical", "single", "strike", "stun", "knockback"],
    baseKind: "weapon",
    baseMult: 1,
    cost: 8,
    cooldown: 0.75,
    components: [
      {
        id: "heavy-impact",
        timing: { start: 0 },
        shape: { type: "circle", radius: 1.6 },
        limits: { maxTargets: 1 },
        damage: { baseMult: 1.35 },
        status: {
          stun: { chance: 0.25, dur: 0.7 },
          knockback: { meters: 1.5 },
        },
        vfxOverrides: {
          impact: { type: "burst", size: 2.5 },
          screenShake: { amplitude: 0.8, duration: 0.12 },
        },
      },
    ],
  },
  {
    schemaVersion: CURRENT_SKILL_SCHEMA_VERSION,
    id: "warrior-cleave",
    name: "Cleave",
    levelReq: 5,
    tags: ["melee", "physical", "aoe", "cone", "shred"],
    baseKind: "weapon",
    baseMult: 1,
    cost: 12,
    cooldown: 1.2,
    components: [
      {
        id: "cleave-cone",
        timing: { start: 0 },
        shape: { type: "cone", angle: 75, range: 3.6 },
        limits: { maxTargets: 5, groupId: "warrior-cleave" },
        status: {
          shred: { drPctPerStack: 10, dur: 3, stacksMax: 3 },
        },
        vfxOverrides: {
          trail: { width: 1.6, duration: 0.18 },
        },
      },
    ],
  },
  {
    schemaVersion: CURRENT_SKILL_SCHEMA_VERSION,
    id: "warrior-ground-slam",
    name: "Ground Slam",
    levelReq: 10,
    tags: ["melee", "physical", "aoe", "delay", "shockwave", "stun"],
    baseKind: "weapon",
    baseMult: 1,
    cost: 16,
    cooldown: 4.5,
    components: [
      {
        id: "slam-impact",
        timing: { start: 0.3 },
        shape: { type: "circle", radius: 3.8 },
        status: {
          stun: { chance: 0.3, dur: 0.8 },
        },
        vfxOverrides: {
          impact: { type: "burst", size: 3.5 },
          screenShake: { amplitude: 1.1, duration: 0.18 },
        },
      },
      {
        id: "slam-ring",
        timing: { start: 0.35 },
        shape: { type: "ring", inner: 3.8, outer: 5.5, expandRate: 8 },
      },
    ],
  },
  {
    schemaVersion: CURRENT_SKILL_SCHEMA_VERSION,
    id: "warrior-sweep",
    name: "Sweep",
    levelReq: 15,
    tags: ["melee", "physical", "aoe", "bleed", "spin"],
    baseKind: "weapon",
    baseMult: 1,
    cost: 14,
    cooldown: 2.2,
    components: [
      {
        id: "sweep-circle",
        timing: { start: 0, duration: 0.4, tickRate: 20 },
        shape: { type: "circle", radius: 3 },
        limits: { perTargetCooldownMs: 200, groupId: "warrior-sweep" },
        status: {
          bleed: { pctOverTime: 0.8, dur: 4, stacksMax: 3 },
        },
        vfxOverrides: {
          trail: { width: 2.2, duration: 0.4 },
        },
      },
    ],
  },
  {
    schemaVersion: CURRENT_SKILL_SCHEMA_VERSION,
    id: "warrior-leap-slam",
    name: "Leap Slam",
    levelReq: 20,
    tags: ["movement", "melee", "physical", "aoe", "gapclose"],
    baseKind: "weapon",
    baseMult: 1,
    cost: 13,
    cooldown: 7,
    components: [
      {
        id: "leap-motion",
        timing: { start: 0 },
        movement: {
          type: "leap",
          distance: 8,
          airtime: 0.55,
          allowPassThrough: true,
          targeting: "cursor",
        },
        status: {
          stun: { chance: 0, dur: 0 },
        },
      },
      {
        id: "leap-impact",
        timing: { start: 0.55 },
        shape: { type: "circle", radius: 3.2 },
        status: {
          knockback: { meters: 1.2 },
        },
        vfxOverrides: {
          impact: { type: "burst", size: 3.4 },
          screenShake: { amplitude: 1.0, duration: 0.14 },
        },
      },
    ],
  },
  {
    schemaVersion: CURRENT_SKILL_SCHEMA_VERSION,
    id: "warrior-shield-charge",
    name: "Shield Charge",
    levelReq: 25,
    tags: ["movement", "melee", "physical", "dash", "knockback"],
    baseKind: "weapon",
    baseMult: 1,
    cost: 12,
    cooldown: 6.5,
    components: [
      {
        id: "charge-motion",
        timing: { start: 0 },
        movement: {
          type: "dash",
          distance: 12,
          speed: 20,
          stopOnCollision: true,
          targeting: "forward",
        },
      },
      {
        id: "charge-line",
        timing: { start: 0 },
        shape: { type: "line", length: 12, width: 1.4 },
        limits: { groupId: "shield-charge" },
        status: {
          knockback: { meters: 2 },
        },
        vfxOverrides: {
          trail: { width: 1.4, duration: 0.25 },
        },
      },
    ],
  },
  {
    schemaVersion: CURRENT_SKILL_SCHEMA_VERSION,
    id: "warrior-lunge",
    name: "Lunge",
    levelReq: 25,
    tags: ["movement", "melee", "physical", "gapclose", "single"],
    baseKind: "weapon",
    baseMult: 1,
    cost: 11,
    cooldown: 5.5,
    components: [
      {
        id: "lunge-motion",
        timing: { start: 0 },
        movement: {
          type: "lunge",
          maxDistance: 10,
          speed: 24,
          stickToTarget: true,
        },
      },
      {
        id: "lunge-impact",
        timing: { start: 0.15 },
        shape: { type: "circle", radius: 1.4 },
        damage: { baseMult: 1.45 },
        status: {
          knockback: { meters: 0.8 },
        },
        vfxOverrides: {
          impact: { type: "burst", size: 1.8 },
        },
      },
    ],
  },
];

let hydrated = false;

function ensureHydrated() {
  if (!hydrated) {
    defaultSkills.forEach((skill) => {
      store.set(skill.id, cloneSkillData(skill));
    });
    hydrated = true;
  }
}

export function listSkills(): SkillData[] {
  ensureHydrated();
  return Array.from(store.values()).map((skill) => cloneSkillData(skill));
}

export function getSkill(id: string): SkillData | undefined {
  ensureHydrated();
  const skill = store.get(id);
  return skill ? cloneSkillData(skill) : undefined;
}

export function upsertSkill(skill: SkillData): void {
  ensureHydrated();
  store.set(skill.id, cloneSkillData(skill));
}

export function deleteSkill(id: string): void {
  ensureHydrated();
  store.delete(id);
}

export function resetSkills(): void {
  store.clear();
  hydrated = false;
  ensureHydrated();
}
