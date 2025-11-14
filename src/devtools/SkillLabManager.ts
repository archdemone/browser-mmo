import { SkillDraftStore } from "./hooks/useSkillDraft";
import { SkillLabPanel } from "./SkillLabPanel";
import { applySupports, SupportEntry } from "../supports/supports.schema";
import type { SkillData } from "../skills/skills.schema";

const sharedStore = new SkillDraftStore();
let storeInitialized = false;
let sharedPanel: SkillLabPanel | null = null;

function ensureStore(): void {
  if (storeInitialized) {
    return;
  }
  sharedStore.init();
  storeInitialized = true;
}

export function createSkillLabPanel(): SkillLabPanel {
  if (!sharedPanel) {
    sharedPanel = new SkillLabPanel(sharedStore);
  }
  ensureStore();
  return sharedPanel;
}

export function getSkillLabStore(): SkillDraftStore {
  ensureStore();
  return sharedStore;
}

export function getDerivedSkill(): SkillData | null {
  ensureStore();
  const state = sharedStore.getState();
  const baseSkill =
    state.skills.find((entry) => entry.id === state.selectedSkillId) ??
    state.skills[0] ??
    null;
  if (!baseSkill) {
    return null;
  }
  const supportIds = state.appliedSupports[baseSkill.id] ?? [];
  const supports = supportIds
    .map((supportId) => state.supports.find((entry) => entry.id === supportId))
    .filter((entry): entry is SupportEntry => Boolean(entry));
  const result = applySupports(baseSkill, supports);
  return result.skill;
}
