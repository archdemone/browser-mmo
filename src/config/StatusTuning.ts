export interface StatusPolicy {
  stacking: "refresh" | "add" | "extend";
  maxStacks: number;
  refreshDurationOnReapply: boolean;
}

export const DEFAULT_STATUS_TUNING = {
  bleed: {
    pctOverTime: 1.0,
    dur: 4.0,
    stacksMax: 3,
  },
  shred: {
    drPctPerStack: 10,
    dur: 3,
    stacksMax: 3,
  },
  stun: {
    chance: 0.25,
    dur: 0.7,
  },
  knockback: {
    meters: 1.5,
    immunityMs: 300,
  },
} as const;

export const STATUS_POLICIES: Record<string, StatusPolicy> = {
  bleed: {
    stacking: "add",
    maxStacks: DEFAULT_STATUS_TUNING.bleed.stacksMax,
    refreshDurationOnReapply: true,
  },
  shred: {
    stacking: "add",
    maxStacks: DEFAULT_STATUS_TUNING.shred.stacksMax,
    refreshDurationOnReapply: true,
  },
  stun: {
    stacking: "refresh",
    maxStacks: 1,
    refreshDurationOnReapply: true,
  },
  knockback: {
    stacking: "refresh",
    maxStacks: 1,
    refreshDurationOnReapply: false,
  },
};

