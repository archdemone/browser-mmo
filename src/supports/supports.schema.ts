import { cloneSkillData, SkillData } from "../skills/skills.schema";

export type SupportOpPhase = "pre" | "main" | "post" | "penalties";

export type SupportOpType =
  | "multiply"
  | "add"
  | "clampMin"
  | "clampMax"
  | "set"
  | "push";

export interface SupportOp {
  phase: SupportOpPhase;
  target: string;
  op: SupportOpType;
  value: unknown;
}

export interface SupportDefinition {
  id: string;
  name: string;
  requiresTags: string[];
  description: string;
  ops: SupportOp[];
}

export interface SupportPenalty {
  costPct?: number;
  cooldownPct?: number;
}

export interface SupportEntry extends SupportDefinition {
  penalties?: SupportPenalty;
}

export interface SupportApplicationIssue {
  supportId: string;
  message: string;
  target?: string;
}

export interface SupportOpTrace {
  supportId: string;
  phase: SupportOpPhase;
  target: string;
  op: SupportOpType;
  before: unknown;
  after: unknown;
}

export interface SupportApplicationResult {
  skill: SkillData;
  trace: SupportOpTrace[];
  issues: SupportApplicationIssue[];
}

const CANONICAL_PHASE_ORDER: SupportOpPhase[] = [
  "pre",
  "main",
  "post",
  "penalties",
];

export function validateSupport(
  skill: SkillData,
  support: SupportEntry
): { valid: boolean; reason?: string } {
  if (!support.requiresTags || support.requiresTags.length === 0) {
    return { valid: true };
  }
  const missing = support.requiresTags.filter(
    (tag) => !skill.tags.includes(tag)
  );
  if (missing.length === 0) {
    return { valid: true };
  }
  return {
    valid: false,
    reason: `Requires tags: ${missing.join(", ")}`,
  };
}

function parsePath(path: string): (string | number)[] {
  const segments: (string | number)[] = [];
  const tokens = path.split(".");
  for (const token of tokens) {
    const parts = token.split(/[[\]]/).filter(Boolean);
    for (const part of parts) {
      if (/^\d+$/.test(part)) {
        segments.push(Number(part));
      } else {
        segments.push(part);
      }
    }
  }
  return segments;
}

function getParentAndKey(
  root: Record<string, unknown>,
  path: (string | number)[]
): { parent: Record<string, unknown> | unknown[] | null; key: string | number } {
  if (path.length === 0) {
    return { parent: null, key: "" };
  }
  let cursor: any = root;
  for (let i = 0; i < path.length - 1; i++) {
    const segment = path[i];
    if (typeof segment === "number") {
      if (!Array.isArray(cursor)) {
        return { parent: null, key: segment };
      }
      if (!cursor[segment]) {
        cursor[segment] = {};
      }
      cursor = cursor[segment];
    } else {
      if (cursor[segment] === undefined) {
        cursor[segment] = {};
      }
      cursor = cursor[segment];
    }
    if (cursor === null || typeof cursor !== "object") {
      return { parent: null, key: path[path.length - 1] };
    }
  }
  return { parent: cursor, key: path[path.length - 1] };
}

function getValue(root: unknown, path: (string | number)[]): unknown {
  let cursor: any = root;
  for (const segment of path) {
    if (cursor === undefined || cursor === null) {
      return undefined;
    }
    cursor = cursor[segment as keyof typeof cursor];
  }
  return cursor;
}

function applyOp(
  parent: Record<string, unknown> | unknown[] | null,
  key: string | number,
  op: SupportOpType,
  value: unknown,
  supportId: string,
  target: string,
  issues: SupportApplicationIssue[]
): { before: unknown; after: unknown } | null {
  if (parent === null) {
    issues.push({
      supportId,
      target,
      message: "Target path is invalid",
    });
    return null;
  }

  if (Array.isArray(parent)) {
    if (typeof key !== "number") {
      issues.push({
        supportId,
        target,
        message: "Array path requires numeric index",
      });
      return null;
    }
    if (op === "push") {
      parent.push(value);
      return { before: undefined, after: [...parent] };
    }
    const before = parent[key];
    switch (op) {
      case "set":
        parent[key] = value;
        break;
      case "add":
        if (typeof before === "number" && typeof value === "number") {
          parent[key] = before + value;
        } else {
          issues.push({
            supportId,
            target,
            message: "add requires numeric target/value",
          });
        }
        break;
      case "multiply":
        if (typeof before === "number" && typeof value === "number") {
          parent[key] = before * value;
        } else {
          issues.push({
            supportId,
            target,
            message: "multiply requires numeric target/value",
          });
        }
        break;
      case "clampMin":
        if (typeof before === "number" && typeof value === "number") {
          parent[key] = Math.max(before, value);
        } else {
          issues.push({
            supportId,
            target,
            message: "clampMin requires numeric target/value",
          });
        }
        break;
      case "clampMax":
        if (typeof before === "number" && typeof value === "number") {
          parent[key] = Math.min(before, value);
        } else {
          issues.push({
            supportId,
            target,
            message: "clampMax requires numeric target/value",
          });
        }
        break;
      case "push":
        issues.push({
          supportId,
          target,
          message: "push is only valid for array parent without explicit index",
        });
        break;
      default:
        issues.push({
          supportId,
          target,
          message: `Unsupported operation ${op}`,
        });
    }
    return { before, after: parent[key] };
  }

  const before = (parent as Record<string, unknown>)[key as string];
  switch (op) {
    case "set":
      (parent as Record<string, unknown>)[key as string] = value;
      break;
    case "push": {
      const existing = (parent as Record<string, unknown>)[key as string];
      if (Array.isArray(existing)) {
        existing.push(value);
      } else if (existing === undefined) {
        (parent as Record<string, unknown>)[key as string] = [value];
      } else {
        issues.push({
          supportId,
          target,
          message: "push requires array target",
        });
      }
      break;
    }
    case "add":
      if (typeof before === "number" && typeof value === "number") {
        (parent as Record<string, unknown>)[key as string] = before + value;
      } else {
        issues.push({
          supportId,
          target,
          message: "add requires numeric target/value",
        });
      }
      break;
    case "multiply":
      if (typeof before === "number" && typeof value === "number") {
        (parent as Record<string, unknown>)[key as string] = before * value;
      } else {
        issues.push({
          supportId,
          target,
          message: "multiply requires numeric target/value",
        });
      }
      break;
    case "clampMin":
      if (typeof before === "number" && typeof value === "number") {
        (parent as Record<string, unknown>)[key as string] = Math.max(before, value);
      } else {
        issues.push({
          supportId,
          target,
          message: "clampMin requires numeric target/value",
        });
      }
      break;
    case "clampMax":
      if (typeof before === "number" && typeof value === "number") {
        (parent as Record<string, unknown>)[key as string] = Math.min(before, value);
      } else {
        issues.push({
          supportId,
          target,
          message: "clampMax requires numeric target/value",
        });
      }
      break;
    default:
      issues.push({
        supportId,
        target,
        message: `Unsupported operation ${op}`,
      });
  }

  return { before, after: (parent as Record<string, unknown>)[key as string] };
}

export function applySupports(
  baseSkill: SkillData,
  supports: SupportEntry[]
): SupportApplicationResult {
  const skill = cloneSkillData(baseSkill);
  const trace: SupportOpTrace[] = [];
  const issues: SupportApplicationIssue[] = [];

  const supportsByPhase: Record<SupportOpPhase, SupportEntry[]> = {
    pre: [],
    main: [],
    post: [],
    penalties: [],
  };

  supports.forEach((support) => {
    const validation = validateSupport(baseSkill, support);
    if (!validation.valid) {
      issues.push({
        supportId: support.id,
        message: validation.reason ?? "Support requirements not met",
      });
      return;
    }

    for (const phase of CANONICAL_PHASE_ORDER) {
      if (
        support.ops.some((op) => op.phase === phase) ||
        (support.penalties && phase === "penalties")
      ) {
        supportsByPhase[phase].push(support);
      }
    }
  });

  const skillMutable = skill as unknown as Record<string, unknown>;

  for (const phase of CANONICAL_PHASE_ORDER) {
    const supportsInPhase = supportsByPhase[phase];
    for (const support of supportsInPhase) {
      const operations =
        phase === "penalties"
          ? support.ops.filter((op) => op.phase === "penalties")
          : support.ops.filter((op) => op.phase === phase);

      for (const op of operations) {
        const pathSegments = parsePath(op.target);
        const { parent, key } = getParentAndKey(skillMutable, pathSegments);
        const before = getValue(skillMutable, pathSegments);
        const applied = applyOp(
          parent,
          key,
          op.op,
          op.value,
          support.id,
          op.target,
          issues
        );
        if (applied) {
          trace.push({
            supportId: support.id,
            phase,
            target: op.target,
            op: op.op,
            before,
            after: applied.after,
          });
        }
      }

      if (phase === "penalties" && support.penalties) {
        if (support.penalties.costPct) {
          const beforeCost = skill.cost;
          skill.cost *= 1 + support.penalties.costPct / 100;
          trace.push({
            supportId: support.id,
            phase,
            target: "cost",
            op: "multiply",
            before: beforeCost,
            after: skill.cost,
          });
        }
        if (support.penalties.cooldownPct) {
          const beforeCooldown = skill.cooldown;
          skill.cooldown *= 1 + support.penalties.cooldownPct / 100;
          trace.push({
            supportId: support.id,
            phase,
            target: "cooldown",
            op: "multiply",
            before: beforeCooldown,
            after: skill.cooldown,
          });
        }
      }
    }
  }

  return { skill, trace, issues };
}
