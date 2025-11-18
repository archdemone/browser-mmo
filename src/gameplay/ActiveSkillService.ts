import { cloneSkillData, SkillData } from "../skills/skills.schema";
import { upsertSkill } from "../skills/skills.registry";

export type SkillSlotId = "skill1" | "skill2";

type AssignmentListener = (slot: SkillSlotId, skill: SkillData | null) => void;

const SKILL_SLOTS: SkillSlotId[] = ["skill1", "skill2"];

class ActiveSkillServiceImpl {
  private readonly assignments: Record<SkillSlotId, SkillData | null> = {
    skill1: null,
    skill2: null,
  };
  private readonly listeners = new Set<AssignmentListener>();

  assignSkill(slot: SkillSlotId, skill: SkillData): void {
    const savedSkill = cloneSkillData(skill);
    upsertSkill(savedSkill);
    this.assignments[slot] = savedSkill;
    console.log(
      `[MCP] Saved skill '${savedSkill.name}' (${savedSkill.id}) and bound it to slot ${slot}`
    );
    this.notify(slot, savedSkill);
  }

  getSkill(slot: SkillSlotId): SkillData | null {
    const skill = this.assignments[slot];
    return skill ? cloneSkillData(skill) : null;
  }

  subscribe(listener: AssignmentListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  clearSlot(slot: SkillSlotId): void {
    this.assignments[slot] = null;
    this.notify(slot, null);
  }

  private notify(slot: SkillSlotId, skill: SkillData | null): void {
    this.listeners.forEach((callback) => {
      try {
        callback(slot, skill);
      } catch (error) {
        console.warn("[ActiveSkillService] Subscription failed", error);
      }
    });
  }
}

export const ActiveSkillService = new ActiveSkillServiceImpl();
