"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.STATUS_POLICIES = exports.DEFAULT_STATUS_TUNING = void 0;
exports.DEFAULT_STATUS_TUNING = {
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
};
exports.STATUS_POLICIES = {
    bleed: {
        stacking: "add",
        maxStacks: exports.DEFAULT_STATUS_TUNING.bleed.stacksMax,
        refreshDurationOnReapply: true,
    },
    shred: {
        stacking: "add",
        maxStacks: exports.DEFAULT_STATUS_TUNING.shred.stacksMax,
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
