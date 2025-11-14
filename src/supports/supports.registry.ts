import { SupportEntry } from "./supports.schema";

const store = new Map<string, SupportEntry>();

const defaultSupports: SupportEntry[] = [
  {
    id: "support-increased-area",
    name: "Increased Area",
    requiresTags: ["aoe"],
    description:
      "Expands the area of effect while slightly increasing resource cost.",
    ops: [
      {
        phase: "pre",
        target: "components[0].shape.radius",
        op: "multiply",
        value: 1.2,
      },
      {
        phase: "pre",
        target: "components[0].shape.angle",
        op: "multiply",
        value: 1.2,
      },
      {
        phase: "post",
        target: "components[0].shape.radius",
        op: "clampMax",
        value: 7,
      },
      {
        phase: "post",
        target: "components[0].shape.length",
        op: "clampMax",
        value: 7,
      },
    ],
    penalties: {
      costPct: 10,
    },
  },
  {
    id: "support-more-melee-damage",
    name: "More Melee Damage",
    requiresTags: ["melee"],
    description:
      "Increases base damage at the cost of a slightly longer cooldown.",
    ops: [
      {
        phase: "main",
        target: "baseMult",
        op: "multiply",
        value: 1.3,
      },
    ],
    penalties: {
      cooldownPct: 10,
    },
  },
];

let hydrated = false;

function ensureHydrated() {
  if (!hydrated) {
    defaultSupports.forEach((support) => {
      store.set(support.id, { ...support, ops: [...support.ops] });
    });
    hydrated = true;
  }
}

export function listSupports(): SupportEntry[] {
  ensureHydrated();
  return Array.from(store.values()).map((support) => ({
    ...support,
    ops: support.ops.map((op) => ({ ...op })),
    penalties: support.penalties ? { ...support.penalties } : undefined,
  }));
}

export function getSupport(id: string): SupportEntry | undefined {
  ensureHydrated();
  const support = store.get(id);
  if (!support) {
    return undefined;
  }
  return {
    ...support,
    ops: support.ops.map((op) => ({ ...op })),
    penalties: support.penalties ? { ...support.penalties } : undefined,
  };
}

export function upsertSupport(support: SupportEntry): void {
  ensureHydrated();
  store.set(support.id, {
    ...support,
    ops: support.ops.map((op) => ({ ...op })),
    penalties: support.penalties ? { ...support.penalties } : undefined,
  });
}

export function deleteSupport(id: string): void {
  ensureHydrated();
  store.delete(id);
}

export function resetSupports(): void {
  store.clear();
  hydrated = false;
  ensureHydrated();
}

