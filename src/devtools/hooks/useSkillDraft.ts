import {
  SkillData,
  SkillComponent,
  cloneSkillData,
  validateSkillData,
  CURRENT_SKILL_SCHEMA_VERSION,
} from "../../skills/skills.schema";
import {
  listSkills as listRegistrySkills,
  resetSkills as resetRegistrySkills,
} from "../../skills/skills.registry";
import {
  listSupports as listRegistrySupports,
  SupportEntry,
  applySupports,
  validateSupport,
  SupportApplicationResult,
} from "../../supports/supports.schema";
import {
  SkillLabSnapshot,
  clearDraftSnapshot,
  loadCommittedSnapshot,
  loadDraftSnapshot,
  saveCommittedSnapshot,
  saveDraftSnapshot,
  writeSnapshotToSource,
} from "../../utils/persistence";
import type { DummySpawnConfig } from "../DummySpawner";
import defaults from "../../config/defaults.json";

export const SKILL_CHOICE_LEVELS: Readonly<Record<number, readonly string[]>> = Object.freeze({
  25: ["warrior-shield-charge", "warrior-lunge"],
});

type Subscriber = (state: SkillDraftState) => void;

interface SkillLabProfile {
  dummy: DummySpawnConfig;
  toggles: {
    infiniteMana: boolean;
    ignoreCooldowns: boolean;
    deterministic: boolean;
  };
}

export interface SkillDraftState {
  skills: SkillData[];
  supports: SupportEntry[];
  selectedSkillId?: string;
  appliedSupports: Record<string, string[]>;
  supportIssues: Record<string, string>;
  lowVisibility: boolean;
  infiniteMana: boolean;
  ignoreCooldowns: boolean;
  deterministic: boolean;
  simulateLevel: number;
  variantSlot: "A" | "B";
  variants: Record<string, { A?: SkillData; B?: SkillData }>;
  lastSaveAt: number;
  lastCommitAt: number;
  undoAvailable: boolean;
  redoAvailable: boolean;
  opTrace: SupportApplicationResult["trace"];
  profiles: Record<string, SkillLabProfile>;
  activeProfileId: string;
  dummyConfig: DummySpawnConfig;
}

interface HistoryEntry {
  skills: SkillData[];
  appliedSupports: Record<string, string[]>;
  variants: SkillDraftState["variants"];
  dummyConfig: DummySpawnConfig;
}

const AUTOSAVE_INTERVAL_MS = 2000;
const UNDO_LIMIT = 20;

export class SkillDraftStore {
  private state: SkillDraftState;
  private readonly subscribers: Set<Subscriber> = new Set();
  private autosaveTimer: number | null = null;
  private undoStack: HistoryEntry[] = [];
  private redoStack: HistoryEntry[] = [];
  private initialized = false;

  constructor() {
    const profiles = parseProfiles((defaults as any)?.profiles);
    const activeProfileId = Object.keys(profiles)[0] ?? "default";
    const activeProfile = profiles[activeProfileId];
    const baselineSkills = listRegistrySkills().map(cloneSkillData);
    const baselineSupports = listRegistrySupports();
    this.state = {
      skills: baselineSkills,
      supports: baselineSupports,
      selectedSkillId: baselineSkills[0]?.id,
      appliedSupports: {},
      supportIssues: {},
      lowVisibility: false,
      infiniteMana: activeProfile.toggles.infiniteMana,
      ignoreCooldowns: activeProfile.toggles.ignoreCooldowns,
      deterministic: activeProfile.toggles.deterministic,
      simulateLevel: 1,
      variantSlot: "A",
      variants: {},
      lastSaveAt: 0,
      lastCommitAt: 0,
      undoAvailable: false,
      redoAvailable: false,
      opTrace: [],
      profiles,
      activeProfileId,
      dummyConfig: cloneDummyConfig(activeProfile.dummy),
    };
  }

  init(): void {
    if (this.initialized) {
      this.notify();
      return;
    }
    this.initialized = true;
    const draft = loadDraftSnapshot();
    if (draft) {
      this.hydrateFromSnapshot(draft, false);
    } else {
      const committed = loadCommittedSnapshot();
      if (committed) {
        this.hydrateFromSnapshot(committed, true);
      }
    }
    this.scheduleAutosave();
    this.notify();
  }

  dispose(): void {
    if (this.autosaveTimer !== null) {
      clearInterval(this.autosaveTimer);
      this.autosaveTimer = null;
    }
    this.subscribers.clear();
    this.initialized = false;
  }

  subscribe(callback: Subscriber): () => void {
    this.subscribers.add(callback);
    callback(this.getState());
    return () => {
      this.subscribers.delete(callback);
    };
  }

  getState(): SkillDraftState {
    return {
      ...this.state,
      skills: this.state.skills.map(cloneSkillData),
      supports: this.state.supports.map(cloneSupportEntry),
      appliedSupports: deepCloneSupports(this.state.appliedSupports),
      supportIssues: { ...this.state.supportIssues },
      variants: deepCloneVariants(this.state.variants),
      profiles: cloneProfiles(this.state.profiles),
      dummyConfig: cloneDummyConfig(this.state.dummyConfig),
    };
  }

  selectSkill(id: string): void {
    if (this.state.selectedSkillId === id) {
      return;
    }
    this.state.selectedSkillId = id;
    this.refreshSupportTrace(id);
    this.notify();
  }

  addSkill(template?: SkillData): void {
    const base =
      template ??
      cloneSkillData({
        schemaVersion: CURRENT_SKILL_SCHEMA_VERSION,
        id: `skill-${Date.now().toString(36)}`,
        name: "New Skill",
        levelReq: 1,
        tags: ["melee"],
        baseKind: "weapon",
        baseMult: 1,
        cost: 10,
        cooldown: 1,
        components: [],
      });
    this.pushUndo();
    this.state.skills = [...this.state.skills, cloneSkillData(base)];
    this.state.selectedSkillId = base.id;
    this.refreshSupportTrace(base.id);
    this.clearRedo();
    this.notify();
  }

  duplicateSkill(skillId: string): void {
    const original = this.state.skills.find((skill) => skill.id === skillId);
    if (!original) {
      return;
    }
    const copy = cloneSkillData(original);
    copy.id = `${original.id}-copy-${Date.now().toString(36)}`;
    copy.name = `${original.name} Copy`;
    this.pushUndo();
    this.state.skills = [...this.state.skills, copy];
    this.state.selectedSkillId = copy.id;
    this.refreshSupportTrace(copy.id);
    this.clearRedo();
    this.notify();
  }

  removeSkill(skillId: string): void {
    const index = this.state.skills.findIndex((skill) => skill.id === skillId);
    if (index === -1) {
      return;
    }
    this.pushUndo();
    const skills = [...this.state.skills];
    skills.splice(index, 1);
    this.state.skills = skills;
    const { [skillId]: _removed, ...rest } = this.state.appliedSupports;
    this.state.appliedSupports = rest;
    delete this.state.variants[skillId];
    const nextSelected = this.state.skills[0]?.id;
    this.state.selectedSkillId = nextSelected;
    this.refreshSupportTrace(nextSelected);
    this.clearRedo();
    this.notify();
  }

  resetSkillsToRegistry(): void {
    this.pushUndo();
    resetSkills();
    this.state.skills = listRegistrySkills().map(cloneSkillData);
    this.state.appliedSupports = {};
    this.state.supportIssues = {};
    this.state.selectedSkillId = this.state.skills[0]?.id;
    this.state.variants = {};
    this.pruneAllSupports();
    this.refreshSupportTrace(this.state.selectedSkillId);
    this.clearRedo();
    this.notify();
  }

  updateSkill(skillId: string, mutate: (draft: SkillData) => void): void {
    const index = this.state.skills.findIndex((skill) => skill.id === skillId);
    if (index === -1) {
      return;
    }
    this.pushUndo();
    const skills = [...this.state.skills];
    const draft = cloneSkillData(skills[index]);
    mutate(draft);
    draft.components = [...draft.components].sort(
      (a, b) => a.timing.start - b.timing.start
    );
    skills[index] = draft;
    this.state.skills = skills;
    this.pruneSupportsForSkill(skillId, draft);
    this.refreshSupportTrace(skillId);
    this.clearRedo();
    this.notify();
  }

  addComponent(skillId: string, component: SkillComponent): void {
    this.updateSkill(skillId, (draft) => {
      draft.components = [...draft.components, cloneComponent(component)];
    });
  }

  reorderComponent(skillId: string, from: number, to: number): void {
    if (from === to) {
      return;
    }
    this.updateSkill(skillId, (draft) => {
      const components = [...draft.components];
      const [moved] = components.splice(from, 1);
      components.splice(to, 0, moved);
      draft.components = components;
    });
  }

  duplicateComponent(skillId: string, componentIndex: number): void {
    this.updateSkill(skillId, (draft) => {
      const source = draft.components[componentIndex];
      if (!source) {
        return;
      }
      const clone = cloneComponent(source);
      clone.id = `${source.id}-copy-${Date.now().toString(36)}`;
      draft.components.splice(componentIndex + 1, 0, clone);
    });
  }

  deleteComponent(skillId: string, componentIndex: number): void {
    this.updateSkill(skillId, (draft) => {
      draft.components = draft.components.filter((_, index) => index !== componentIndex);
    });
  }

  setSupportsForSkill(skillId: string, supportIds: string[]): void {
    const skill = this.state.skills.find((s) => s.id === skillId);
    if (!skill) {
      return;
    }
    const normalized: string[] = [];
    supportIds.forEach((supportId) => {
      const support = this.state.supports.find((entry) => entry.id === supportId);
      if (!support) {
        return;
      }
      const validation = validateSupport(skill, support);
      if (validation.valid) {
        if (!normalized.includes(supportId)) {
          normalized.push(supportId);
        }
      } else {
        console.warn(
          `[SkillLab] Support ${support.name} not applied: ${validation.reason ?? "requirements not met"}`
        );
      }
    });
    this.pushUndo();
    if (normalized.length === 0) {
      const { [skillId]: _removed, ...rest } = this.state.appliedSupports;
      this.state.appliedSupports = rest;
    } else {
      this.state.appliedSupports = {
        ...this.state.appliedSupports,
        [skillId]: normalized,
      };
    }
    this.refreshSupportTrace(skillId);
    this.clearRedo();
    this.notify();
  }

  toggleSupport(skillId: string, supportId: string): void {
    const current = this.state.appliedSupports[skillId] ?? [];
    const exists = current.includes(supportId);
    const updated = exists
      ? current.filter((id) => id !== supportId)
      : [...current, supportId];
    this.setSupportsForSkill(skillId, updated);
  }

  setLowVisibility(enabled: boolean): void {
    if (this.state.lowVisibility === enabled) {
      return;
    }
    this.state.lowVisibility = enabled;
    this.notify();
  }

  setInfiniteMana(enabled: boolean): void {
    if (this.state.infiniteMana === enabled) {
      return;
    }
    this.state.infiniteMana = enabled;
    this.notify();
  }

  setIgnoreCooldowns(enabled: boolean): void {
    if (this.state.ignoreCooldowns === enabled) {
      return;
    }
    this.state.ignoreCooldowns = enabled;
    this.notify();
  }

  setDeterministic(enabled: boolean): void {
    if (this.state.deterministic === enabled) {
      return;
    }
    this.state.deterministic = enabled;
    this.notify();
  }

  setSimulateLevel(level: number): void {
    const next = Math.max(1, Math.floor(level));
    if (this.state.simulateLevel === next) {
      return;
    }
    this.state.simulateLevel = next;
    this.notify();
  }

  setVariantSlot(slot: "A" | "B"): void {
    if (this.state.variantSlot === slot) {
      return;
    }
    this.state.variantSlot = slot;
    this.notify();
  }

  saveVariant(skillId: string): void {
    const skill = this.state.skills.find((s) => s.id === skillId);
    if (!skill) {
      return;
    }
    const variants = { ...this.state.variants };
    const entry = { ...(variants[skillId] ?? {}) };
    entry[this.state.variantSlot] = cloneSkillData(skill);
    variants[skillId] = entry;
    this.state.variants = variants;
    this.notify();
  }

  loadVariant(skillId: string, slot: "A" | "B"): void {
    const variant = this.state.variants[skillId]?.[slot];
    if (!variant) {
      return;
    }
    this.updateSkill(skillId, (draft) => {
      Object.assign(draft, cloneSkillData(variant));
    });
  }

  applyProfile(profileId: string): void {
    const profile = this.state.profiles[profileId];
    if (!profile) {
      return;
    }
    this.state.activeProfileId = profileId;
    this.state.infiniteMana = profile.toggles.infiniteMana;
    this.state.ignoreCooldowns = profile.toggles.ignoreCooldowns;
    this.state.deterministic = profile.toggles.deterministic;
    this.state.dummyConfig = cloneDummyConfig(profile.dummy);
    this.notify();
  }

  updateDummyConfig(partial: Partial<DummySpawnConfig>): void {
    const merged = {
      ...this.state.dummyConfig,
      ...partial,
    };
    this.state.dummyConfig = normalizeDummyConfig(merged);
    this.notify();
  }

  undo(): void {
    if (this.undoStack.length === 0) {
      return;
    }
    const entry = this.undoStack.pop()!;
    this.redoStack.push(this.captureHistory());
    this.state.skills = entry.skills.map(cloneSkillData);
    this.state.appliedSupports = deepCloneSupports(entry.appliedSupports);
    this.state.variants = deepCloneVariants(entry.variants);
    this.state.dummyConfig = cloneDummyConfig(entry.dummyConfig);
    this.pruneAllSupports();
    this.refreshSupportTrace(this.state.selectedSkillId);
    this.syncHistoryFlags();
    this.notify();
  }

  redo(): void {
    if (this.redoStack.length === 0) {
      return;
    }
    const entry = this.redoStack.pop()!;
    this.undoStack.push(this.captureHistory());
    this.state.skills = entry.skills.map(cloneSkillData);
    this.state.appliedSupports = deepCloneSupports(entry.appliedSupports);
    this.state.variants = deepCloneVariants(entry.variants);
    this.state.dummyConfig = cloneDummyConfig(entry.dummyConfig);
    this.pruneAllSupports();
    this.refreshSupportTrace(this.state.selectedSkillId);
    this.syncHistoryFlags();
    this.notify();
  }

  exportSnapshot(): SkillLabSnapshot {
    return this.buildSnapshot(Date.now());
  }

  async commit(): Promise<void> {
    const snapshot = this.buildSnapshot(Date.now());
    saveCommittedSnapshot(snapshot);
    this.state.lastCommitAt = snapshot.updatedAt;
    this.notify();
    try {
      await writeSnapshotToSource(snapshot);
    } catch {
      // optional source write failure
    }
  }

  importSnapshot(snapshot: SkillLabSnapshot): void {
    this.hydrateFromSnapshot(snapshot, false);
    this.notify();
  }

  clearDraft(): void {
    clearDraftSnapshot();
    this.state.lastSaveAt = 0;
    this.notify();
  }

  private scheduleAutosave(): void {
    if (typeof window === "undefined") {
      return;
    }
    if (this.autosaveTimer !== null) {
      clearInterval(this.autosaveTimer);
    }
    this.autosaveTimer = window.setInterval(() => {
      const snapshot = this.buildSnapshot(Date.now());
      saveDraftSnapshot(snapshot);
      this.state.lastSaveAt = snapshot.updatedAt;
      this.notify();
    }, AUTOSAVE_INTERVAL_MS);
  }

  private hydrateFromSnapshot(snapshot: SkillLabSnapshot, commit: boolean): void {
    const skills: SkillData[] = [];
    snapshot.skills.forEach((raw) => {
      const result = validateSkillData(raw);
      if (result.valid && result.data) {
        skills.push(result.data);
      }
    });
    const supportsSource = snapshot.supports?.length
      ? snapshot.supports
      : listRegistrySupports();
    this.state.skills = skills.map(cloneSkillData);
    this.state.supports = supportsSource.map(cloneSupportEntry);

    const metadata = snapshot.metadata ?? {};
    this.state.selectedSkillId = metadata.selectedSkillId ?? this.state.skills[0]?.id;
    this.state.appliedSupports = deepCloneSupports(
      (metadata.appliedSupports as Record<string, string[]>) ?? {}
    );
    this.state.lowVisibility = Boolean(metadata.lowVisibility);
    if (metadata.infiniteMana !== undefined) {
      this.state.infiniteMana = Boolean(metadata.infiniteMana);
    }
    if (metadata.ignoreCooldowns !== undefined) {
      this.state.ignoreCooldowns = Boolean(metadata.ignoreCooldowns);
    }
    if (metadata.deterministic !== undefined) {
      this.state.deterministic = Boolean(metadata.deterministic);
    }
    if (metadata.simulateLevel !== undefined) {
      this.state.simulateLevel = Math.max(1, Math.floor(Number(metadata.simulateLevel)));
    }
    this.state.variantSlot = metadata.variantSlot === "B" ? "B" : "A";
    this.state.variants = deepCloneVariants(
      (metadata.variants as SkillDraftState["variants"]) ?? {}
    );
    if (metadata.activeProfileId && this.state.profiles[metadata.activeProfileId]) {
      this.state.activeProfileId = metadata.activeProfileId;
    }
    const profile = this.state.profiles[this.state.activeProfileId];
    const snapshotDummy = metadata.dummyConfig as Partial<DummySpawnConfig> | undefined;
    this.state.dummyConfig = snapshotDummy
      ? normalizeDummyConfig(snapshotDummy)
      : cloneDummyConfig(profile.dummy);

    this.undoStack = [];
    this.redoStack = [];
    this.pruneAllSupports();
    this.refreshSupportTrace(this.state.selectedSkillId);
    this.syncHistoryFlags();

    if (commit) {
      this.state.lastCommitAt = snapshot.updatedAt;
    } else {
      this.state.lastSaveAt = snapshot.updatedAt;
    }
  }

  private buildSnapshot(updatedAt: number): SkillLabSnapshot {
    return {
      skills: this.state.skills.map(cloneSkillData),
      supports: this.state.supports.map(cloneSupportEntry),
      updatedAt,
      metadata: {
        selectedSkillId: this.state.selectedSkillId,
        appliedSupports: deepCloneSupports(this.state.appliedSupports),
        lowVisibility: this.state.lowVisibility,
        infiniteMana: this.state.infiniteMana,
        ignoreCooldowns: this.state.ignoreCooldowns,
        deterministic: this.state.deterministic,
        simulateLevel: this.state.simulateLevel,
        variantSlot: this.state.variantSlot,
        variants: deepCloneVariants(this.state.variants),
        activeProfileId: this.state.activeProfileId,
        dummyConfig: cloneDummyConfig(this.state.dummyConfig),
      },
    };
  }

  private pushUndo(): void {
    this.undoStack.push(this.captureHistory());
    if (this.undoStack.length > UNDO_LIMIT) {
      this.undoStack.shift();
    }
    this.syncHistoryFlags();
  }

  private captureHistory(): HistoryEntry {
    return {
      skills: this.state.skills.map(cloneSkillData),
      appliedSupports: deepCloneSupports(this.state.appliedSupports),
      variants: deepCloneVariants(this.state.variants),
      dummyConfig: cloneDummyConfig(this.state.dummyConfig),
    };
  }

  private clearRedo(): void {
    this.redoStack = [];
    this.syncHistoryFlags();
  }

  private syncHistoryFlags(): void {
    this.state.undoAvailable = this.undoStack.length > 0;
    this.state.redoAvailable = this.redoStack.length > 0;
  }

  private notify(): void {
    const snapshot = this.getState();
    this.subscribers.forEach((callback) => callback(snapshot));
  }

  private refreshSupportTrace(skillId?: string): void {
    if (!skillId) {
      this.state.opTrace = [];
      this.state.supportIssues = {};
      return;
    }
    const skill = this.state.skills.find((s) => s.id === skillId);
    if (!skill) {
      this.state.opTrace = [];
      this.state.supportIssues = {};
      return;
    }
    this.pruneSupportsForSkill(skillId, skill);
    const supportIds = this.state.appliedSupports[skillId] ?? [];
    const supports = supportIds
      .map((id) => this.state.supports.find((entry) => entry.id === id))
      .filter((entry): entry is SupportEntry => Boolean(entry));
    if (supports.length === 0) {
      this.state.opTrace = [];
      this.state.supportIssues = {};
      return;
    }
    const result = applySupports(skill, supports);
    const supportIssues: Record<string, string> = {};
    result.issues.forEach((issue) => {
      if (issue.supportId) {
        supportIssues[issue.supportId] = issue.message;
      }
    });
    this.state.opTrace = result.trace;
    this.state.supportIssues = supportIssues;
  }

  private pruneAllSupports(): void {
    Object.keys(this.state.appliedSupports).forEach((skillId) => {
      const skill = this.state.skills.find((s) => s.id === skillId);
      if (skill) {
        this.pruneSupportsForSkill(skillId, skill);
      }
    });
  }

  private pruneSupportsForSkill(skillId: string, skill?: SkillData): void {
    const target = skill ?? this.state.skills.find((s) => s.id === skillId);
    if (!target) {
      return;
    }
    const current = this.state.appliedSupports[skillId] ?? [];
    if (current.length === 0) {
      return;
    }
    const valid: string[] = [];
    current.forEach((supportId) => {
      const support = this.state.supports.find((entry) => entry.id === supportId);
      if (!support) {
        return;
      }
      const validation = validateSupport(target, support);
      if (validation.valid) {
        valid.push(supportId);
      }
    });
    if (valid.length === 0) {
      const { [skillId]: _removed, ...rest } = this.state.appliedSupports;
      this.state.appliedSupports = rest;
    } else if (valid.length !== current.length) {
      this.state.appliedSupports = {
        ...this.state.appliedSupports,
        [skillId]: valid,
      };
    }
  }
}

function parseProfiles(raw: any): Record<string, SkillLabProfile> {
  const result: Record<string, SkillLabProfile> = {};
  if (raw && typeof raw === "object") {
    for (const [id, value] of Object.entries(raw as Record<string, any>)) {
      const dummy = normalizeDummyConfig((value as any)?.dummy ?? {});
      const togglesSource = (value as any)?.toggles ?? {};
      result[id] = {
        dummy,
        toggles: {
          infiniteMana: Boolean(togglesSource.infiniteMana),
          ignoreCooldowns: Boolean(togglesSource.ignoreCooldowns),
          deterministic: Boolean(togglesSource.deterministic),
        },
      };
    }
  }
  if (Object.keys(result).length === 0) {
    result.default = {
      dummy: {
        formation: "single",
        count: 1,
        armor: 0,
        maxHealth: 1000,
        moveSpeed: 0,
      },
      toggles: {
        infiniteMana: false,
        ignoreCooldowns: false,
        deterministic: false,
      },
    };
  }
  return result;
}

function normalizeDummyConfig(source: Partial<DummySpawnConfig>): DummySpawnConfig {
  const formation = source.formation === "pack" || source.formation === "line" ? source.formation : "single";
  const count = Number.isFinite(source.count) ? Math.max(1, Math.floor(source.count!)) : 1;
  const armor = Number.isFinite(source.armor) ? Math.max(0, Math.floor(source.armor!)) : 0;
  const maxHealth = Number.isFinite(source.maxHealth) ? Math.max(1, Math.floor(source.maxHealth!)) : 1000;
  const moveSpeed = Number.isFinite(source.moveSpeed) ? Number(source.moveSpeed) : 0;
  return { formation, count, armor, maxHealth, moveSpeed };
}

function cloneSupportEntry(entry: SupportEntry): SupportEntry {
  return {
    ...entry,
    ops: entry.ops.map((op) => ({ ...op })),
    penalties: entry.penalties ? { ...entry.penalties } : undefined,
  };
}

function cloneProfiles(profiles: Record<string, SkillLabProfile>): Record<string, SkillLabProfile> {
  const clone: Record<string, SkillLabProfile> = {};
  Object.entries(profiles).forEach(([id, profile]) => {
    clone[id] = cloneProfile(profile);
  });
  return clone;
}

function cloneProfile(profile: SkillLabProfile): SkillLabProfile {
  return {
    dummy: cloneDummyConfig(profile.dummy),
    toggles: { ...profile.toggles },
  };
}

function cloneDummyConfig(config: DummySpawnConfig): DummySpawnConfig {
  return {
    formation: config.formation,
    count: config.count,
    armor: config.armor,
    maxHealth: config.maxHealth,
    moveSpeed: config.moveSpeed,
  };
}

function deepCloneSupports(supports: Record<string, string[]>): Record<string, string[]> {
  const clone: Record<string, string[]> = {};
  Object.entries(supports).forEach(([skillId, list]) => {
    clone[skillId] = [...list];
  });
  return clone;
}

function deepCloneVariants(variants: SkillDraftState["variants"]): SkillDraftState["variants"] {
  const clone: SkillDraftState["variants"] = {};
  Object.entries(variants).forEach(([skillId, entry]) => {
    clone[skillId] = {
      A: entry.A ? cloneSkillData(entry.A) : undefined,
      B: entry.B ? cloneSkillData(entry.B) : undefined,
    };
  });
  return clone;
}

function cloneComponent(component: SkillComponent): SkillComponent {
  return JSON.parse(JSON.stringify(component)) as SkillComponent;
}
