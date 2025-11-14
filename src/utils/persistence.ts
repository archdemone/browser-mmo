import { SkillData } from "../skills/skills.schema";
import { SupportEntry } from "../supports/supports.schema";

const DRAFT_KEY = "skillLab.drafts.v1";
const COMMIT_KEY = "skillLab.commits.v1";

export interface SkillLabSnapshot {
  skills: SkillData[];
  supports: SupportEntry[];
  updatedAt: number;
  metadata?: Record<string, unknown>;
}

export type SourceWriteHandler = (snapshot: SkillLabSnapshot) => Promise<void>;

let writeHandler: SourceWriteHandler | null = null;

function getLocalStorage(): Storage | null {
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      return window.localStorage;
    }
  } catch {
    /* no-op */
  }
  return null;
}

function safeParse(value: string | null): SkillLabSnapshot | null {
  if (!value) {
    return null;
  }
  try {
    const parsed = JSON.parse(value) as SkillLabSnapshot;
    if (!parsed.skills || !parsed.supports) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function loadDraftSnapshot(): SkillLabSnapshot | null {
  const storage = getLocalStorage();
  if (!storage) {
    return null;
  }
  return safeParse(storage.getItem(DRAFT_KEY));
}

export function saveDraftSnapshot(snapshot: SkillLabSnapshot): void {
  const storage = getLocalStorage();
  if (!storage) {
    return;
  }
  storage.setItem(DRAFT_KEY, JSON.stringify(snapshot));
}

export function clearDraftSnapshot(): void {
  const storage = getLocalStorage();
  if (!storage) {
    return;
  }
  storage.removeItem(DRAFT_KEY);
}

export function loadCommittedSnapshot(): SkillLabSnapshot | null {
  const storage = getLocalStorage();
  if (!storage) {
    return null;
  }
  return safeParse(storage.getItem(COMMIT_KEY));
}

export function saveCommittedSnapshot(snapshot: SkillLabSnapshot): void {
  const storage = getLocalStorage();
  if (storage) {
    storage.setItem(COMMIT_KEY, JSON.stringify(snapshot));
  }
}

export function registerSourceWriteHandler(handler: SourceWriteHandler) {
  writeHandler = handler;
}

export async function writeSnapshotToSource(
  snapshot: SkillLabSnapshot
): Promise<void> {
  if (!writeHandler) {
    throw new Error("No source write handler registered");
  }
  await writeHandler(snapshot);
}

