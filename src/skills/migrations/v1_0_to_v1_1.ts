import {
  ComponentShape,
  CURRENT_SKILL_SCHEMA_VERSION,
  SkillComponent,
  SkillData,
  StatusDefaults,
  VfxDefaults,
} from "../skills.schema";

export type LegacySkillShape =
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
    }
  | { type: "ring"; inner: number; outer: number; expandRate?: number }
  | { type: "custom"; ref: string };

export interface SkillDataV1 {
  id: string;
  name: string;
  levelReq: number;
  tags: string[];
  baseKind: "weapon" | "spell";
  baseMult: number;
  cost: number;
  cooldown: number;
  shape: LegacySkillShape;
  timing?: {
    delay?: number;
    duration?: number;
    tickRate?: number;
  };
  status?: StatusDefaults;
  vfx?: VfxDefaults;
  editor?: { iconPath?: string; color?: string; notes?: string };
}

export function migrateV1Skill(skill: SkillDataV1): SkillData {
  const component: SkillComponent = {
    id: `${skill.id}-primary`,
    timing: {
      start: skill.timing?.delay ?? 0,
      duration: skill.timing?.duration,
      tickRate: skill.timing?.tickRate,
    },
    shape: convertLegacyShape(skill.shape),
  };

  return {
    schemaVersion: CURRENT_SKILL_SCHEMA_VERSION,
    id: skill.id,
    name: skill.name,
    levelReq: skill.levelReq,
    tags: [...skill.tags],
    baseKind: skill.baseKind,
    baseMult: skill.baseMult,
    cost: skill.cost,
    cooldown: skill.cooldown,
    components: [component],
    statusDefaults: skill.status,
    vfxDefaults: skill.vfx,
    editor: skill.editor,
  };
}

export function needsMigration(
  skill: SkillData | SkillDataV1
): skill is SkillDataV1 {
  return (skill as SkillData).schemaVersion === undefined;
}

function convertLegacyShape(shape: LegacySkillShape): ComponentShape {
  switch (shape.type) {
    case "circle":
    case "cone":
    case "line":
    case "ring":
    case "custom":
      return { ...shape };
    case "projectile":
      return { ...shape };
    default:
      return { type: "custom", ref: "legacy/unknown" };
  }
}

