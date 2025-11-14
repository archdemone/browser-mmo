/**
 * Canonical schema definitions for Skill Lab data structures.
 * Everything the editor, executor, supports engine, and persistence layer
 * should reference lives here so type drift does not occur.
 */

export const CURRENT_SKILL_SCHEMA_VERSION = "1.1" as const;

export type SkillSchemaVersion = typeof CURRENT_SKILL_SCHEMA_VERSION;

export type SkillTag =
  | "melee"
  | "physical"
  | "aoe"
  | "cone"
  | "line"
  | "circle"
  | "projectile"
  | "duration"
  | "bleed"
  | "stun"
  | "knockback"
  | "shred"
  | "movement"
  | "gapclose"
  | "single"
  | "strike"
  | "delay"
  | "spin"
  | "shockwave"
  | "dash"
  | "channel"
  | "summon"
  | "utility"
  | (string & {});

export type ComponentShape =
  | { type: "circle"; radius: number }
  | { type: "cone"; angle: number; range: number }
  | { type: "line"; length: number; width: number }
  | {
      type: "projectile";
      speed: number;
      lifetime: number;
      count: number;
      pierce?: number;
      chain?: number;
      pattern?: "straight" | "spread" | "return";
    }
  | { type: "ring"; inner: number; outer: number; expandRate?: number }
  | { type: "custom"; ref: string };

export type MovementAction =
  | {
      type: "dash";
      distance: number;
      speed: number;
      stopOnCollision: boolean;
      targeting: "forward" | "cursor" | "target";
    }
  | {
      type: "leap";
      distance: number;
      airtime: number;
      allowPassThrough: boolean;
      targeting: "cursor" | "target";
    }
  | {
      type: "lunge";
      maxDistance: number;
      speed: number;
      stickToTarget: boolean;
    }
  | { type: "custom"; ref: string; params?: Record<string, unknown> };

export interface StatusDefaults {
  bleed?: { pctOverTime: number; dur: number; stacksMax: number };
  shred?: { drPctPerStack: number; dur: number; stacksMax: number };
  stun?: { chance: number; dur: number };
  knockback?: { meters: number; immunityMs?: number };
}

export interface VfxDefaults {
  palette?: string;
  trail?: { width: number; duration: number };
  impact?: { type: "circle" | "line" | "burst"; size: number; color?: string };
  particles?: { count: number; size: number; lifetime: number };
  screenShake?: { amplitude: number; duration: number };
  // global time-dilation toggle lives in editor configuration, not per skill.
}

export interface SkillComponentLimits {
  maxTargets?: number;
  perTargetCooldownMs?: number;
  groupId?: string;
}

export interface SkillComponentDamageOverrides {
  baseMult?: number;
  addedFlat?: number;
  critOverride?: number;
}

export interface SkillComponent {
  id: string;
  timing: {
    start: number;
    duration?: number;
    tickRate?: number;
  };
  shape?: ComponentShape;
  motion?: {
    kind: "none" | "followCaster" | "followTarget" | "arc" | "dash";
    params?: Record<string, number>;
  }; // provide motion for movement-only components or moving hit volumes
  movement?: MovementAction;
  limits?: SkillComponentLimits;
  status?: Partial<StatusDefaults>;
  vfxOverrides?: Partial<VfxDefaults>;
  damage?: SkillComponentDamageOverrides;
}

export interface SkillData {
  schemaVersion: SkillSchemaVersion;
  id: string;
  name: string;
  levelReq: number;
  tags: SkillTag[];
  baseKind: "weapon" | "spell";
  baseMult: number;
  cost: number;
  cooldown: number;
  components: SkillComponent[];
  statusDefaults?: StatusDefaults;
  vfxDefaults?: VfxDefaults;
  editor?: { iconPath?: string; color?: string; notes?: string };
}

export interface ValidationIssue {
  path: string;
  message: string;
}

export interface ValidationResult<T> {
  valid: boolean;
  data?: T;
  issues: ValidationIssue[];
}

const numberFields = new Set<string>([
  "start",
  "duration",
  "tickRate",
  "radius",
  "angle",
  "range",
  "length",
  "width",
  "speed",
  "lifetime",
  "count",
  "pierce",
  "chain",
  "inner",
  "outer",
  "expandRate",
  "distance",
  "airtime",
  "baseMult",
  "addedFlat",
  "critOverride",
  "pctOverTime",
  "dur",
  "stacksMax",
  "drPctPerStack",
  "chance",
  "meters",
  "immunityMs",
  "amplitude",
  "size",
  "duration",
  "cost",
  "cooldown",
  "levelReq",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function assertNumber(
  record: Record<string, unknown>,
  key: string,
  path: string,
  issues: ValidationIssue[],
  required = true
): number | undefined {
  const value = record[key];
  if (value === undefined || value === null) {
    if (required) {
      issues.push({ path, message: "Missing required number" });
    }
    return undefined;
  }
  if (!isNumber(value)) {
    issues.push({ path, message: `Expected number, received ${typeof value}` });
    return undefined;
  }
  return value;
}

function validateComponentShape(
  shape: unknown,
  path: string,
  issues: ValidationIssue[]
): ComponentShape | undefined {
  if (shape === undefined) {
    return undefined;
  }
  if (!isRecord(shape)) {
    issues.push({ path, message: "Shape must be an object" });
    return undefined;
  }

  const type = shape["type"];
  if (type === "circle") {
    const radius = assertNumber(shape, "radius", `${path}.radius`, issues);
    if (radius !== undefined) {
      return { type: "circle", radius };
    }
  } else if (type === "cone") {
    const angle = assertNumber(shape, "angle", `${path}.angle`, issues);
    const range = assertNumber(shape, "range", `${path}.range`, issues);
    if (angle !== undefined && range !== undefined) {
      return { type: "cone", angle, range };
    }
  } else if (type === "line") {
    const length = assertNumber(shape, "length", `${path}.length`, issues);
    const width = assertNumber(shape, "width", `${path}.width`, issues);
    if (length !== undefined && width !== undefined) {
      return { type: "line", length, width };
    }
  } else if (type === "projectile") {
    const speed = assertNumber(shape, "speed", `${path}.speed`, issues);
    const lifetime = assertNumber(shape, "lifetime", `${path}.lifetime`, issues);
    const count = assertNumber(shape, "count", `${path}.count`, issues);
    if (speed !== undefined && lifetime !== undefined && count !== undefined) {
      const projectileShape: ComponentShape = {
        type: "projectile",
        speed,
        lifetime,
        count,
      };
      if (shape["pierce"] !== undefined) {
        const pierce = assertNumber(shape, "pierce", `${path}.pierce`, issues, false);
        if (pierce !== undefined) {
          projectileShape.pierce = pierce;
        }
      }
      if (shape["chain"] !== undefined) {
        const chain = assertNumber(shape, "chain", `${path}.chain`, issues, false);
        if (chain !== undefined) {
          projectileShape.chain = chain;
        }
      }
      if (shape["pattern"] !== undefined) {
        const pattern = shape["pattern"];
        if (
          pattern === "straight" ||
          pattern === "spread" ||
          pattern === "return"
        ) {
          projectileShape.pattern = pattern;
        } else {
          issues.push({
            path: `${path}.pattern`,
            message: "Unsupported projectile pattern",
          });
        }
      }
      return projectileShape;
    }
  } else if (type === "ring") {
    const inner = assertNumber(shape, "inner", `${path}.inner`, issues);
    const outer = assertNumber(shape, "outer", `${path}.outer`, issues);
    if (inner !== undefined && outer !== undefined) {
      const ringShape: ComponentShape = { type: "ring", inner, outer };
      if (shape["expandRate"] !== undefined) {
        const expandRate = assertNumber(
          shape,
          "expandRate",
          `${path}.expandRate`,
          issues,
          false
        );
        if (expandRate !== undefined) {
          ringShape.expandRate = expandRate;
        }
      }
      return ringShape;
    }
  } else if (type === "custom") {
    const ref = shape["ref"];
    if (typeof ref === "string" && ref.length > 0) {
      return { type: "custom", ref };
    }
    issues.push({ path: `${path}.ref`, message: "Custom shape requires ref" });
  } else {
    issues.push({ path, message: `Unsupported shape type ${String(type)}` });
  }
  return undefined;
}

function validateMovementAction(
  action: unknown,
  path: string,
  issues: ValidationIssue[]
): MovementAction | undefined {
  if (action === undefined) {
    return undefined;
  }
  if (!isRecord(action)) {
    issues.push({ path, message: "Movement action must be an object" });
    return undefined;
  }
  const type = action["type"];
  if (type === "dash") {
    const distance = assertNumber(action, "distance", `${path}.distance`, issues);
    const speed = assertNumber(action, "speed", `${path}.speed`, issues);
    const stopOnCollision = action["stopOnCollision"];
    const targeting = action["targeting"];
    if (
      distance !== undefined &&
      speed !== undefined &&
      typeof stopOnCollision === "boolean" &&
      (targeting === "forward" || targeting === "cursor" || targeting === "target")
    ) {
      return {
        type: "dash",
        distance,
        speed,
        stopOnCollision,
        targeting,
      };
    }
    issues.push({
      path,
      message: "Dash action missing required fields",
    });
  } else if (type === "leap") {
    const distance = assertNumber(action, "distance", `${path}.distance`, issues);
    const airtime = assertNumber(action, "airtime", `${path}.airtime`, issues);
    const allowPassThrough = action["allowPassThrough"];
    const targeting = action["targeting"];
    if (
      distance !== undefined &&
      airtime !== undefined &&
      typeof allowPassThrough === "boolean" &&
      (targeting === "cursor" || targeting === "target")
    ) {
      return {
        type: "leap",
        distance,
        airtime,
        allowPassThrough,
        targeting,
      };
    }
    issues.push({
      path,
      message: "Leap action missing required fields",
    });
  } else if (type === "lunge") {
    const maxDistance = assertNumber(
      action,
      "maxDistance",
      `${path}.maxDistance`,
      issues
    );
    const speed = assertNumber(action, "speed", `${path}.speed`, issues);
    const stickToTarget = action["stickToTarget"];
    if (
      maxDistance !== undefined &&
      speed !== undefined &&
      typeof stickToTarget === "boolean"
    ) {
      return {
        type: "lunge",
        maxDistance,
        speed,
        stickToTarget,
      };
    }
    issues.push({
      path,
      message: "Lunge action missing required fields",
    });
  } else if (type === "custom") {
    const ref = action["ref"];
    if (typeof ref === "string" && ref.length > 0) {
      const params =
        action["params"] && isRecord(action["params"])
          ? (action["params"] as Record<string, unknown>)
          : undefined;
      return { type: "custom", ref, params };
    }
    issues.push({
      path: `${path}.ref`,
      message: "Custom movement action requires a ref string",
    });
  } else {
    issues.push({ path, message: `Unsupported movement action ${String(type)}` });
  }
  return undefined;
}

function validateStatusDefaults(
  status: unknown,
  path: string,
  issues: ValidationIssue[]
): StatusDefaults | undefined {
  if (status === undefined) {
    return undefined;
  }
  if (!isRecord(status)) {
    issues.push({ path, message: "Status defaults must be an object" });
    return undefined;
  }
  const result: StatusDefaults = {};
  if (status["bleed"]) {
    const bleed = status["bleed"];
    if (isRecord(bleed)) {
      const pct = assertNumber(bleed, "pctOverTime", `${path}.bleed.pctOverTime`, issues);
      const dur = assertNumber(bleed, "dur", `${path}.bleed.dur`, issues);
      const stacks = assertNumber(
        bleed,
        "stacksMax",
        `${path}.bleed.stacksMax`,
        issues
      );
      if (pct !== undefined && dur !== undefined && stacks !== undefined) {
        result.bleed = { pctOverTime: pct, dur, stacksMax: stacks };
      }
    } else {
      issues.push({ path: `${path}.bleed`, message: "Bleed must be an object" });
    }
  }
  if (status["shred"]) {
    const shred = status["shred"];
    if (isRecord(shred)) {
      const dr = assertNumber(shred, "drPctPerStack", `${path}.shred.drPctPerStack`, issues);
      const dur = assertNumber(shred, "dur", `${path}.shred.dur`, issues);
      const stacks = assertNumber(
        shred,
        "stacksMax",
        `${path}.shred.stacksMax`,
        issues
      );
      if (dr !== undefined && dur !== undefined && stacks !== undefined) {
        result.shred = { drPctPerStack: dr, dur, stacksMax: stacks };
      }
    } else {
      issues.push({ path: `${path}.shred`, message: "Shred must be an object" });
    }
  }
  if (status["stun"]) {
    const stun = status["stun"];
    if (isRecord(stun)) {
      const chance = assertNumber(stun, "chance", `${path}.stun.chance`, issues);
      const dur = assertNumber(stun, "dur", `${path}.stun.dur`, issues);
      if (chance !== undefined && dur !== undefined) {
        result.stun = { chance, dur };
      }
    } else {
      issues.push({ path: `${path}.stun`, message: "Stun must be an object" });
    }
  }
  if (status["knockback"]) {
    const knockback = status["knockback"];
    if (isRecord(knockback)) {
      const meters = assertNumber(knockback, "meters", `${path}.knockback.meters`, issues);
      if (meters !== undefined) {
        const immunity = knockback["immunityMs"];
        if (immunity !== undefined && !isNumber(immunity)) {
          issues.push({
            path: `${path}.knockback.immunityMs`,
            message: "immunityMs must be a number",
          });
        }
        result.knockback = {
          meters,
          immunityMs: isNumber(immunity) ? immunity : undefined,
        };
      }
    } else {
      issues.push({
        path: `${path}.knockback`,
        message: "Knockback must be an object",
      });
    }
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

function validateComponent(
  component: unknown,
  index: number,
  issues: ValidationIssue[]
): SkillComponent | undefined {
  const path = `components[${index}]`;
  if (!isRecord(component)) {
    issues.push({ path, message: "Component must be an object" });
    return undefined;
  }
  const id = component["id"];
  if (typeof id !== "string" || id.length === 0) {
    issues.push({ path: `${path}.id`, message: "Component requires id string" });
    return undefined;
  }
  const timingRaw = component["timing"];
  if (!isRecord(timingRaw)) {
    issues.push({
      path: `${path}.timing`,
      message: "Component timing must be an object",
    });
    return undefined;
  }
  const start = assertNumber(timingRaw, "start", `${path}.timing.start`, issues);
  const timing: SkillComponent["timing"] = { start: start ?? 0 };
  if (timingRaw["duration"] !== undefined) {
    const duration = assertNumber(
      timingRaw,
      "duration",
      `${path}.timing.duration`,
      issues,
      false
    );
    if (duration !== undefined) {
      timing.duration = duration;
    }
  }
  if (timingRaw["tickRate"] !== undefined) {
    const tickRate = assertNumber(
      timingRaw,
      "tickRate",
      `${path}.timing.tickRate`,
      issues,
      false
    );
    if (tickRate !== undefined) {
      timing.tickRate = tickRate;
    }
  }

  const result: SkillComponent = { id, timing };

  result.shape = validateComponentShape(component["shape"], `${path}.shape`, issues);
  const motion = component["motion"];
  if (motion !== undefined) {
    if (!isRecord(motion)) {
      issues.push({
        path: `${path}.motion`,
        message: "Motion must be an object",
      });
    } else {
      const kind = motion["kind"];
      if (
        kind === "none" ||
        kind === "followCaster" ||
        kind === "followTarget" ||
        kind === "arc" ||
        kind === "dash"
      ) {
        const motionEntry: NonNullable<SkillComponent["motion"]> = { kind };
        if (motion["params"] !== undefined) {
          if (isRecord(motion["params"])) {
            const params: Record<string, number> = {};
            for (const [pKey, pValue] of Object.entries(motion["params"])) {
              if (isNumber(pValue)) {
                params[pKey] = pValue;
              } else {
                issues.push({
                  path: `${path}.motion.params.${pKey}`,
                  message: "Motion params must be numbers",
                });
              }
            }
            motionEntry.params = params;
          } else {
            issues.push({
              path: `${path}.motion.params`,
              message: "Motion params must be an object",
            });
          }
        }
        result.motion = motionEntry;
      } else {
        issues.push({
          path: `${path}.motion.kind`,
          message: `Unsupported motion kind ${String(kind)}`,
        });
      }
    }
  }

  result.movement = validateMovementAction(
    component["movement"],
    `${path}.movement`,
    issues
  );

  if (component["limits"] !== undefined) {
    if (isRecord(component["limits"])) {
      const limitsRaw = component["limits"];
      const limits: SkillComponentLimits = {};
      if (limitsRaw["maxTargets"] !== undefined) {
        const maxTargets = assertNumber(
          limitsRaw,
          "maxTargets",
          `${path}.limits.maxTargets`,
          issues,
          false
        );
        if (maxTargets !== undefined) {
          limits.maxTargets = maxTargets;
        }
      }
      if (limitsRaw["perTargetCooldownMs"] !== undefined) {
        const cd = assertNumber(
          limitsRaw,
          "perTargetCooldownMs",
          `${path}.limits.perTargetCooldownMs`,
          issues,
          false
        );
        if (cd !== undefined) {
          limits.perTargetCooldownMs = cd;
        }
      }
      if (limitsRaw["groupId"] !== undefined) {
        const groupId = limitsRaw["groupId"];
        if (typeof groupId === "string" && groupId.length > 0) {
          limits.groupId = groupId;
        } else {
          issues.push({
            path: `${path}.limits.groupId`,
            message: "groupId must be non-empty string",
          });
        }
      }
      result.limits = limits;
    } else {
      issues.push({
        path: `${path}.limits`,
        message: "Limits must be an object",
      });
    }
  }

  result.status = validateStatusDefaults(
    component["status"],
    `${path}.status`,
    issues
  );
  const vfxOverrides = validateVfxDefaults(
    component["vfxOverrides"],
    `${path}.vfxOverrides`,
    issues
  );
  if (vfxOverrides) {
    result.vfxOverrides = vfxOverrides;
  }

  if (component["damage"] !== undefined) {
    if (isRecord(component["damage"])) {
      const damageRaw = component["damage"];
      const damage: SkillComponentDamageOverrides = {};
      if (damageRaw["baseMult"] !== undefined) {
        const baseMult = assertNumber(
          damageRaw,
          "baseMult",
          `${path}.damage.baseMult`,
          issues,
          false
        );
        if (baseMult !== undefined) {
          damage.baseMult = baseMult;
        }
      }
      if (damageRaw["addedFlat"] !== undefined) {
        const addedFlat = assertNumber(
          damageRaw,
          "addedFlat",
          `${path}.damage.addedFlat`,
          issues,
          false
        );
        if (addedFlat !== undefined) {
          damage.addedFlat = addedFlat;
        }
      }
      if (damageRaw["critOverride"] !== undefined) {
        const critOverride = assertNumber(
          damageRaw,
          "critOverride",
          `${path}.damage.critOverride`,
          issues,
          false
        );
        if (critOverride !== undefined) {
          damage.critOverride = critOverride;
        }
      }
      if (Object.keys(damage).length > 0) {
        result.damage = damage;
      }
    } else {
      issues.push({
        path: `${path}.damage`,
        message: "Damage overrides must be an object",
      });
    }
  }

  return result;
}

function validateVfxDefaults(
  vfx: unknown,
  path: string,
  issues: ValidationIssue[]
): VfxDefaults | undefined {
  if (vfx === undefined) {
    return undefined;
  }
  if (!isRecord(vfx)) {
    issues.push({ path, message: "VFX defaults must be an object" });
    return undefined;
  }
  const result: VfxDefaults = {};
  if (vfx["palette"] !== undefined) {
    if (typeof vfx["palette"] === "string") {
      result.palette = vfx["palette"];
    } else {
      issues.push({
        path: `${path}.palette`,
        message: "palette must be a string",
      });
    }
  }
  if (vfx["trail"] !== undefined) {
    const trail = vfx["trail"];
    if (isRecord(trail)) {
      const width = assertNumber(trail, "width", `${path}.trail.width`, issues);
      const duration = assertNumber(trail, "duration", `${path}.trail.duration`, issues);
      if (width !== undefined && duration !== undefined) {
        result.trail = { width, duration };
      }
    } else {
      issues.push({
        path: `${path}.trail`,
        message: "trail must be an object",
      });
    }
  }
  if (vfx["impact"] !== undefined) {
    const impact = vfx["impact"];
    if (isRecord(impact)) {
      const type = impact["type"];
      if (type === "circle" || type === "line" || type === "burst") {
        const size = assertNumber(impact, "size", `${path}.impact.size`, issues);
        if (size !== undefined) {
          const entry: VfxDefaults["impact"] = { type, size };
          if (impact["color"] !== undefined) {
            if (typeof impact["color"] === "string") {
              entry.color = impact["color"];
            } else {
              issues.push({
                path: `${path}.impact.color`,
                message: "color must be string",
              });
            }
          }
          result.impact = entry;
        }
      } else {
        issues.push({
          path: `${path}.impact.type`,
          message: "impact.type must be circle | line | burst",
        });
      }
    } else {
      issues.push({
        path: `${path}.impact`,
        message: "impact must be an object",
      });
    }
  }
  if (vfx["particles"] !== undefined) {
    const particles = vfx["particles"];
    if (isRecord(particles)) {
      const count = assertNumber(
        particles,
        "count",
        `${path}.particles.count`,
        issues
      );
      const size = assertNumber(particles, "size", `${path}.particles.size`, issues);
      const lifetime = assertNumber(
        particles,
        "lifetime",
        `${path}.particles.lifetime`,
        issues
      );
      if (count !== undefined && size !== undefined && lifetime !== undefined) {
        result.particles = { count, size, lifetime };
      }
    } else {
      issues.push({
        path: `${path}.particles`,
        message: "particles must be an object",
      });
    }
  }
  if (vfx["screenShake"] !== undefined) {
    const screenShake = vfx["screenShake"];
    if (isRecord(screenShake)) {
      const amplitude = assertNumber(
        screenShake,
        "amplitude",
        `${path}.screenShake.amplitude`,
        issues
      );
      const duration = assertNumber(
        screenShake,
        "duration",
        `${path}.screenShake.duration`,
        issues
      );
      if (amplitude !== undefined && duration !== undefined) {
        result.screenShake = { amplitude, duration };
      }
    } else {
      issues.push({
        path: `${path}.screenShake`,
        message: "screenShake must be an object",
      });
    }
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

export function validateSkillComponent(
  component: unknown,
  index = 0
): ValidationResult<SkillComponent> {
  const issues: ValidationIssue[] = [];
  const result = validateComponent(component, index, issues);
  return {
    valid: result !== undefined && issues.length === 0,
    data: result,
    issues,
  };
}

export function validateSkillData(data: unknown): ValidationResult<SkillData> {
  const issues: ValidationIssue[] = [];
  if (!isRecord(data)) {
    issues.push({ path: "", message: "Skill data must be an object" });
    return { valid: false, issues };
  }

  const schemaVersion = data["schemaVersion"];
  if (schemaVersion !== CURRENT_SKILL_SCHEMA_VERSION) {
    issues.push({
      path: "schemaVersion",
      message: `Unsupported schema version ${String(schemaVersion)}`,
    });
  }

  const id = data["id"];
  const name = data["name"];
  if (typeof id !== "string" || id.length === 0) {
    issues.push({ path: "id", message: "Skill id must be a non-empty string" });
  }
  if (typeof name !== "string" || name.length === 0) {
    issues.push({
      path: "name",
      message: "Skill name must be a non-empty string",
    });
  }

  const levelReq = assertNumber(data, "levelReq", "levelReq", issues);
  const baseMult = assertNumber(data, "baseMult", "baseMult", issues);
  const cost = assertNumber(data, "cost", "cost", issues);
  const cooldown = assertNumber(data, "cooldown", "cooldown", issues);

  const tagsRaw = data["tags"];
  const tags: SkillTag[] = [];
  if (Array.isArray(tagsRaw)) {
    for (let i = 0; i < tagsRaw.length; i++) {
      const tag = tagsRaw[i];
      if (typeof tag === "string") {
        tags.push(tag as SkillTag);
      } else {
        issues.push({
          path: `tags[${i}]`,
          message: "Tags must be strings",
        });
      }
    }
  } else {
    issues.push({ path: "tags", message: "Tags must be an array" });
  }

  const baseKind = data["baseKind"];
  if (baseKind !== "weapon" && baseKind !== "spell") {
    issues.push({
      path: "baseKind",
      message: "baseKind must be weapon or spell",
    });
  }

  const componentsRaw = data["components"];
  const components: SkillComponent[] = [];
  if (Array.isArray(componentsRaw)) {
    componentsRaw.forEach((component, index) => {
      const validated = validateComponent(component, index, issues);
      if (validated) {
        components.push(validated);
      }
    });
  } else {
    issues.push({
      path: "components",
      message: "components must be an array",
    });
  }

  const statusDefaults = validateStatusDefaults(
    data["statusDefaults"],
    "statusDefaults",
    issues
  );
  const vfxDefaults = validateVfxDefaults(
    data["vfxDefaults"],
    "vfxDefaults",
    issues
  );

  const editorRaw = data["editor"];
  let editor: SkillData["editor"];
  if (editorRaw !== undefined) {
    if (isRecord(editorRaw)) {
      editor = {};
      if (editorRaw["iconPath"] !== undefined) {
        if (typeof editorRaw["iconPath"] === "string") {
          editor.iconPath = editorRaw["iconPath"];
        } else {
          issues.push({
            path: "editor.iconPath",
            message: "iconPath must be string",
          });
        }
      }
      if (editorRaw["color"] !== undefined) {
        if (typeof editorRaw["color"] === "string") {
          editor.color = editorRaw["color"];
        } else {
          issues.push({
            path: "editor.color",
            message: "color must be string",
          });
        }
      }
      if (editorRaw["notes"] !== undefined) {
        if (typeof editorRaw["notes"] === "string") {
          editor.notes = editorRaw["notes"];
        } else {
          issues.push({
            path: "editor.notes",
            message: "notes must be string",
          });
        }
      }
    } else {
      issues.push({
        path: "editor",
        message: "editor metadata must be an object",
      });
    }
  }

  const valid =
    issues.length === 0 &&
    typeof id === "string" &&
    typeof name === "string" &&
    typeof baseKind === "string" &&
    levelReq !== undefined &&
    baseMult !== undefined &&
    cost !== undefined &&
    cooldown !== undefined;

  return {
    valid,
    data: valid
      ? {
          schemaVersion: CURRENT_SKILL_SCHEMA_VERSION,
          id,
          name,
          levelReq: levelReq!,
          tags,
          baseKind: baseKind as SkillData["baseKind"],
          baseMult: baseMult!,
          cost: cost!,
          cooldown: cooldown!,
          components,
          statusDefaults,
          vfxDefaults,
          editor,
        }
      : undefined,
    issues,
  };
}

export function cloneSkillData(skill: SkillData): SkillData {
  return JSON.parse(JSON.stringify(skill)) as SkillData;
}
