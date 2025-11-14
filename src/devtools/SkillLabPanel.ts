import { SkillDraftStore, SkillDraftState } from "./hooks/useSkillDraft";
import { SkillData, SkillComponent } from "../skills/skills.schema";
import { SupportEntry, validateSupport } from "../supports/supports.schema";
import { SkillLabSnapshot } from "../utils/persistence";
import { DummySpawner } from "./DummySpawner";
import { KeybindBar, KeybindSlot } from "../ui/KeybindBar";
import { ChoicePanel } from "../ui/ChoicePanel";

const KNOWN_TAGS: readonly string[] = [
  "melee",
  "physical",
  "aoe",
  "cone",
  "line",
  "circle",
  "projectile",
  "duration",
  "bleed",
  "stun",
  "knockback",
  "shred",
  "movement",
  "gapclose",
  "single",
  "strike",
  "delay",
  "spin",
  "shockwave",
  "dash",
  "channel",
];

const DEFAULT_KEYBIND_SLOTS: KeybindSlot[] = [
  { id: "lmb", label: "LMB" },
  { id: "rmb", label: "RMB" },
  { id: "q", label: "Q" },
  { id: "w", label: "W" },
  { id: "e", label: "E" },
  { id: "r", label: "R" },
];

export interface SkillLabPanelOptions {
  attachTo?: HTMLElement;
}

export class SkillLabPanel {
  private readonly store: SkillDraftStore;
  private readonly dummySpawner = new DummySpawner();
  private readonly keybindBar = new KeybindBar({
    slots: DEFAULT_KEYBIND_SLOTS,
    onAssign: (slot) => this.assignKeybind(slot),
  });
  private readonly choicePanel = new ChoicePanel();

  private state: SkillDraftState | null = null;
  private root: HTMLDivElement | null = null;

  private listColumn: HTMLDivElement | null = null;
  private inspectorColumn: HTMLDivElement | null = null;
  private sandboxColumn: HTMLDivElement | null = null;

  private skillListView: HTMLDivElement | null = null;
  private inspectorView: HTMLDivElement | null = null;
  private supportsView: HTMLDivElement | null = null;
  private traceView: HTMLDivElement | null = null;
  private sandboxView: HTMLDivElement | null = null;

  private autosaveLabel: HTMLSpanElement | null = null;
  private commitLabel: HTMLSpanElement | null = null;
  private undoButton: HTMLButtonElement | null = null;
  private redoButton: HTMLButtonElement | null = null;

  private searchTerm = "";
  private tagFilters = new Set<string>();
  private keybindAssignments: Record<string, string> = {};

  constructor(store?: SkillDraftStore) {
    this.store = store ?? new SkillDraftStore();
  }

  init(options: SkillLabPanelOptions = {}): void {
    if (typeof document === "undefined") {
      console.warn("[SkillLabPanel] document unavailable");
      return;
    }
    if (this.root) {
      return;
    }

    this.store.init();
    const container = options.attachTo ?? document.body;
    this.buildLayout(container);
    this.store.subscribe((state) => {
      this.state = state;
      this.renderAll(state);
    });
  }

  dispose(): void {
    this.store.dispose();
    if (this.root?.parentElement) {
      this.root.parentElement.removeChild(this.root);
    }
    this.root = null;
  }

  getDummySpawner(): DummySpawner {
    return this.dummySpawner;
  }

  private buildLayout(container: HTMLElement): void {
    this.root = document.createElement("div");
    this.root.className = "skilllab-root";
    this.root.style.position = "fixed";
    this.root.style.left = "0";
    this.root.style.top = "0";
    this.root.style.width = "100vw";
    this.root.style.height = "100vh";
    this.root.style.display = "flex";
    this.root.style.background = "rgba(6, 8, 14, 0.94)";
    this.root.style.color = "#f3f5ff";
    this.root.style.fontFamily =
      "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
    this.root.style.fontSize = "13px";
    this.root.style.zIndex = "9998";
    this.root.style.backdropFilter = "blur(16px)";
    container.appendChild(this.root);

    this.listColumn = document.createElement("div");
    this.listColumn.style.flex = "0 0 260px";
    this.listColumn.style.display = "flex";
    this.listColumn.style.flexDirection = "column";
    this.listColumn.style.borderRight = "1px solid rgba(255,255,255,0.08)";
    this.listColumn.style.padding = "16px";
    this.listColumn.style.gap = "12px";
    this.root.appendChild(this.listColumn);

    this.inspectorColumn = document.createElement("div");
    this.inspectorColumn.style.flex = "1 1 auto";
    this.inspectorColumn.style.display = "flex";
    this.inspectorColumn.style.flexDirection = "column";
    this.inspectorColumn.style.padding = "16px";
    this.inspectorColumn.style.gap = "16px";
    this.inspectorColumn.style.overflowY = "auto";
    this.root.appendChild(this.inspectorColumn);

    this.sandboxColumn = document.createElement("div");
    this.sandboxColumn.style.flex = "0 0 320px";
    this.sandboxColumn.style.display = "flex";
    this.sandboxColumn.style.flexDirection = "column";
    this.sandboxColumn.style.padding = "16px";
    this.sandboxColumn.style.gap = "16px";
    this.sandboxColumn.style.borderLeft = "1px solid rgba(255,255,255,0.08)";
    this.sandboxColumn.style.overflowY = "auto";
    this.root.appendChild(this.sandboxColumn);

    this.buildListColumn();
    this.buildInspectorColumn();
    this.buildSandboxColumn();
  }
  private buildListColumn(): void {
    if (!this.listColumn) {
      return;
    }

    const header = document.createElement("div");
    header.style.display = "flex";
    header.style.flexDirection = "column";
    header.style.gap = "8px";

    const title = document.createElement("h2");
    title.textContent = "Skills";
    title.style.margin = "0";
    title.style.fontSize = "16px";
    title.style.fontWeight = "600";
    header.appendChild(title);

    const search = document.createElement("input");
    search.type = "search";
    search.placeholder = "Search...";
    styleInput(search);
    search.oninput = () => {
      this.searchTerm = search.value.toLowerCase();
      this.renderSkillList();
    };
    header.appendChild(search);

    const tags = document.createElement("div");
    tags.style.display = "flex";
    tags.style.flexWrap = "wrap";
    tags.style.gap = "6px";
    KNOWN_TAGS.forEach((tag) => {
      const chip = createChip(tag, false);
      chip.onclick = () => {
        if (this.tagFilters.has(tag)) {
          this.tagFilters.delete(tag);
          chip.style.border = "1px solid rgba(255,255,255,0.12)";
          chip.style.background = "rgba(255,255,255,0.04)";
        } else {
          this.tagFilters.add(tag);
          chip.style.border = "1px solid rgba(255,255,255,0.35)";
          chip.style.background = "rgba(255,255,255,0.16)";
        }
        this.renderSkillList();
      };
      tags.appendChild(chip);
    });
    header.appendChild(tags);

    this.listColumn.appendChild(header);

    this.skillListView = document.createElement("div");
    this.skillListView.style.flex = "1 1 auto";
    this.skillListView.style.display = "flex";
    this.skillListView.style.flexDirection = "column";
    this.skillListView.style.gap = "6px";
    this.skillListView.style.overflowY = "auto";
    this.skillListView.style.paddingRight = "4px";
    this.listColumn.appendChild(this.skillListView);

    const buttons = document.createElement("div");
    buttons.style.display = "grid";
    buttons.style.gridTemplateColumns = "repeat(2, 1fr)";
    buttons.style.gap = "8px";

    buttons.appendChild(createButton("New", () => this.store.addSkill(), true));
    buttons.appendChild(
      createButton("Duplicate", () => {
        const id = this.state?.selectedSkillId;
        if (id) this.store.duplicateSkill(id);
      })
    );
    buttons.appendChild(
      createButton("Delete", () => {
        const id = this.state?.selectedSkillId;
        if (id) this.store.removeSkill(id);
      })
    );
    buttons.appendChild(createButton("Reset", () => this.store.resetSkillsToRegistry()));

    this.listColumn.appendChild(buttons);
  }

  private buildInspectorColumn(): void {
    if (!this.inspectorColumn) {
      return;
    }

    const toolbar = document.createElement("div");
    toolbar.style.display = "flex";
    toolbar.style.gap = "8px";
    toolbar.style.alignItems = "center";

    this.undoButton = createButton("Undo", () => this.store.undo());
    this.redoButton = createButton("Redo", () => this.store.redo());
    toolbar.appendChild(this.undoButton);
    toolbar.appendChild(this.redoButton);
    toolbar.appendChild(createButton("Export", () => downloadSnapshot(this.store.exportSnapshot())));
    toolbar.appendChild(createButton("Import", () => this.promptImport()));
    toolbar.appendChild(createButton("Commit", () => void this.store.commit(), true));
    toolbar.appendChild(createButton("Clear", () => this.store.clearDraft()));
    this.inspectorColumn.appendChild(toolbar);

    const status = document.createElement("div");
    status.style.display = "flex";
    status.style.gap = "12px";
    status.style.fontSize = "11px";
    status.style.opacity = "0.7";
    this.autosaveLabel = document.createElement("span");
    this.commitLabel = document.createElement("span");
    status.appendChild(this.autosaveLabel);
    status.appendChild(this.commitLabel);
    this.inspectorColumn.appendChild(status);

    this.inspectorView = document.createElement("div");
    this.inspectorView.style.display = "flex";
    this.inspectorView.style.flexDirection = "column";
    this.inspectorView.style.gap = "12px";
    this.inspectorColumn.appendChild(this.inspectorView);

    const supportsCard = createCard();
    const supportsTitle = document.createElement("h3");
    supportsTitle.textContent = "Supports";
    supportsTitle.style.margin = "0 0 6px";
    supportsTitle.style.fontSize = "14px";
    supportsTitle.style.fontWeight = "600";
    supportsCard.appendChild(supportsTitle);
    this.supportsView = document.createElement("div");
    this.supportsView.style.display = "flex";
    this.supportsView.style.flexDirection = "column";
    this.supportsView.style.gap = "6px";
    this.supportsView.style.maxHeight = "200px";
    this.supportsView.style.overflowY = "auto";
    supportsCard.appendChild(this.supportsView);
    const traceLabel = document.createElement("div");
    traceLabel.textContent = "Operation trace";
    traceLabel.style.fontSize = "11px";
    traceLabel.style.opacity = "0.7";
    traceLabel.style.marginTop = "6px";
    supportsCard.appendChild(traceLabel);
    this.traceView = document.createElement("div");
    this.traceView.style.fontSize = "11px";
    this.traceView.style.lineHeight = "1.35";
    this.traceView.style.border = "1px solid rgba(255,255,255,0.1)";
    this.traceView.style.borderRadius = "6px";
    this.traceView.style.padding = "6px";
    this.traceView.style.maxHeight = "140px";
    this.traceView.style.overflowY = "auto";
    supportsCard.appendChild(this.traceView);
    this.inspectorColumn.appendChild(supportsCard);
  }

  private buildSandboxColumn(): void {
    if (!this.sandboxColumn) {
      return;
    }
    const title = document.createElement("h2");
    title.textContent = "Sandbox";
    title.style.margin = "0";
    title.style.fontSize = "16px";
    title.style.fontWeight = "600";
    this.sandboxColumn.appendChild(title);

    this.sandboxView = document.createElement("div");
    this.sandboxView.style.display = "flex";
    this.sandboxView.style.flexDirection = "column";
    this.sandboxView.style.gap = "10px";
    this.sandboxColumn.appendChild(this.sandboxView);

    const metrics = document.createElement("div");
    metrics.textContent = "Metrics hook pending executor integration.";
    metrics.style.fontSize = "12px";
    metrics.style.opacity = "0.7";
    this.sandboxColumn.appendChild(metrics);

    const keybindHeading = document.createElement("h3");
    keybindHeading.textContent = "Keybinds";
    keybindHeading.style.margin = "8px 0 0";
    keybindHeading.style.fontSize = "14px";
    keybindHeading.style.fontWeight = "600";
    this.sandboxColumn.appendChild(keybindHeading);
    this.sandboxColumn.appendChild(this.keybindBar.getElement());
  }

  private renderAll(state: SkillDraftState): void {
    this.updateToolbar(state);
    this.renderSkillList();
    this.renderInspector(state);
    this.renderSupports(state);
    this.renderTrace(state);
    this.renderSandbox(state);
    this.applyLowVisibility(state.lowVisibility);
  }

  private renderSkillList(): void {
    if (!this.skillListView || !this.state) {
      return;
    }
    this.skillListView.innerHTML = "";
    const list = this.state.skills.filter((skill) => {
      const matchesSearch =
        !this.searchTerm ||
        skill.name.toLowerCase().includes(this.searchTerm) ||
        skill.id.toLowerCase().includes(this.searchTerm);
      const matchesTags =
        this.tagFilters.size === 0 ||
        Array.from(this.tagFilters).every((tag) => skill.tags.includes(tag));
      return matchesSearch && matchesTags;
    });

    list.forEach((skill) => {
      const button = document.createElement("button");
      button.type = "button";
      button.style.display = "flex";
      button.style.flexDirection = "column";
      button.style.alignItems = "flex-start";
      button.style.gap = "2px";
      button.style.padding = "8px";
      button.style.borderRadius = "6px";
      const selected = this.state?.selectedSkillId === skill.id;
      button.style.border = selected
        ? "1px solid rgba(255,255,255,0.32)"
        : "1px solid rgba(255,255,255,0.12)";
      button.style.background = selected
        ? "rgba(255,255,255,0.16)"
        : "rgba(255,255,255,0.05)";
      button.style.cursor = "pointer";
      button.onclick = () => this.store.selectSkill(skill.id);

      const name = document.createElement("span");
      name.textContent = skill.name;
      name.style.fontWeight = "600";
      button.appendChild(name);

      const meta = document.createElement("span");
      meta.textContent = `Lv ${skill.levelReq} • ${skill.tags.join(", ")}`;
      meta.style.fontSize = "11px";
      meta.style.opacity = "0.7";
      button.appendChild(meta);

      this.skillListView.appendChild(button);
    });

    if (list.length === 0) {
      const empty = document.createElement("div");
      empty.textContent = "No matching skills.";
      empty.style.opacity = "0.65";
      empty.style.fontSize = "12px";
      this.skillListView.appendChild(empty);
    }
  }
  private renderInspector(state: SkillDraftState): void {
    if (!this.inspectorView) {
      return;
    }
    this.inspectorView.innerHTML = "";
    const skill = state.skills.find((s) => s.id === state.selectedSkillId);
    if (!skill) {
      const empty = document.createElement("div");
      empty.textContent = "Select a skill to edit.";
      empty.style.opacity = "0.7";
      this.inspectorView.appendChild(empty);
      return;
    }

    this.inspectorView.appendChild(this.createMetaCard(skill));
    this.inspectorView.appendChild(this.createComponentCard(skill));
    this.inspectorView.appendChild(
      this.createJsonCard("Status Defaults", skill.statusDefaults, "{ \"bleed\": { ... } }", (data) =>
        this.store.updateSkill(skill.id, (draft) => {
          draft.statusDefaults = data;
        })
      )
    );
    this.inspectorView.appendChild(
      this.createJsonCard("VFX Defaults", skill.vfxDefaults, "{ \"trail\": { ... } }", (data) =>
        this.store.updateSkill(skill.id, (draft) => {
          draft.vfxDefaults = data;
        })
      )
    );
  }

  private createMetaCard(skill: SkillData): HTMLElement {
    const card = createCard();
    const title = document.createElement("h3");
    title.textContent = "Meta";
    title.style.margin = "0 0 6px";
    title.style.fontSize = "14px";
    title.style.fontWeight = "600";
    card.appendChild(title);

    card.appendChild(
      labeledInput("Name", skill.name, (value) =>
        this.store.updateSkill(skill.id, (draft) => {
          draft.name = value;
        })
      )
    );

    const idRow = document.createElement("div");
    idRow.textContent = `ID: ${skill.id}`;
    idRow.style.fontSize = "11px";
    idRow.style.opacity = "0.7";
    card.appendChild(idRow);

    card.appendChild(
      labeledNumber("Level Req", skill.levelReq, 1, (value) =>
        this.store.updateSkill(skill.id, (draft) => {
          draft.levelReq = Math.max(1, Math.floor(value));
        })
      )
    );

    card.appendChild(
      labeledSelect(
        "Base Kind",
        [
          { value: "weapon", label: "Weapon" },
          { value: "spell", label: "Spell" },
        ],
        skill.baseKind,
        (value) =>
          this.store.updateSkill(skill.id, (draft) => {
            draft.baseKind = value as SkillData["baseKind"];
          })
      )
    );

    card.appendChild(
      labeledNumber("Base Mult", skill.baseMult, 0, (value) =>
        this.store.updateSkill(skill.id, (draft) => {
          draft.baseMult = value;
        })
      )
    );

    card.appendChild(
      labeledNumber("Cost", skill.cost, 0, (value) =>
        this.store.updateSkill(skill.id, (draft) => {
          draft.cost = value;
        })
      )
    );

    card.appendChild(
      labeledNumber("Cooldown", skill.cooldown, 0, (value) =>
        this.store.updateSkill(skill.id, (draft) => {
          draft.cooldown = value;
        })
      )
    );

    const tagRow = document.createElement("div");
    tagRow.style.display = "flex";
    tagRow.style.flexWrap = "wrap";
    tagRow.style.gap = "6px";
    KNOWN_TAGS.forEach((tag) => {
      const chip = createChip(tag, skill.tags.includes(tag));
      chip.onclick = () =>
        this.store.updateSkill(skill.id, (draft) => {
          if (draft.tags.includes(tag)) {
            draft.tags = draft.tags.filter((t) => t !== tag);
          } else {
            draft.tags = [...draft.tags, tag];
          }
        });
      tagRow.appendChild(chip);
    });
    card.appendChild(tagRow);

    const notes = document.createElement("textarea");
    notes.value = skill.editor?.notes ?? "";
    notes.placeholder = "Notes...";
    notes.style.width = "100%";
    notes.style.minHeight = "60px";
    notes.style.padding = "6px";
    notes.style.borderRadius = "6px";
    notes.style.border = "1px solid rgba(255,255,255,0.1)";
    notes.style.background = "rgba(255,255,255,0.04)";
    notes.style.color = "inherit";
    notes.onchange = () =>
      this.store.updateSkill(skill.id, (draft) => {
        draft.editor = { ...(draft.editor ?? {}), notes: notes.value };
      });
    card.appendChild(notes);

    return card;
  }

  private createComponentCard(skill: SkillData): HTMLElement {
    const card = createCard();
    const header = document.createElement("div");
    header.style.display = "flex";
    header.style.justifyContent = "space-between";
    header.style.alignItems = "center";

    const title = document.createElement("h3");
    title.textContent = "Components";
    title.style.margin = "0";
    title.style.fontSize = "14px";
    title.style.fontWeight = "600";
    header.appendChild(title);

    const add = createButton("Add", () =>
      this.store.addComponent(skill.id, createDefaultComponent()),
    true);
    add.style.padding = "4px 8px";
    add.style.fontSize = "11px";
    header.appendChild(add);
    card.appendChild(header);

    if (skill.components.length === 0) {
      const empty = document.createElement("div");
      empty.textContent = "No components defined.";
      empty.style.opacity = "0.7";
      empty.style.fontSize = "12px";
      card.appendChild(empty);
      return card;
    }

    skill.components.forEach((component, index) => {
      const block = createCard();
      block.style.background = "rgba(255,255,255,0.05)";

      const row = document.createElement("div");
      row.style.display = "flex";
      row.style.justifyContent = "space-between";
      row.style.alignItems = "center";
      row.style.gap = "6px";

      const label = document.createElement("strong");
      label.textContent = component.id;
      label.style.fontSize = "12px";
      row.appendChild(label);

      const buttons = document.createElement("div");
      buttons.style.display = "flex";
      buttons.style.gap = "4px";
      buttons.appendChild(
        createButton("?", () =>
          this.store.reorderComponent(skill.id, index, Math.max(0, index - 1))
        )
      );
      buttons.appendChild(
        createButton("?", () =>
          this.store.reorderComponent(
            skill.id,
            index,
            Math.min(skill.components.length - 1, index + 1)
          )
        )
      );
      buttons.appendChild(
        createButton("Copy", () => this.store.duplicateComponent(skill.id, index))
      );
      buttons.appendChild(
        createButton("Del", () => this.store.deleteComponent(skill.id, index))
      );
      row.appendChild(buttons);
      block.appendChild(row);

      block.appendChild(
        labeledNumber("Start", component.timing.start, 0, (value) =>
          this.store.updateSkill(skill.id, (draft) => {
            draft.components[index].timing.start = value;
          })
        )
      );
      block.appendChild(
        labeledNumber("Duration", component.timing.duration ?? 0, 0, (value) =>
          this.store.updateSkill(skill.id, (draft) => {
            const target = draft.components[index];
            if (value <= 0) delete target.timing.duration;
            else target.timing.duration = value;
          })
        )
      );
      block.appendChild(
        labeledNumber("TickRate", component.timing.tickRate ?? 0, 0, (value) =>
          this.store.updateSkill(skill.id, (draft) => {
            const target = draft.components[index];
            if (value <= 0) delete target.timing.tickRate;
            else target.timing.tickRate = value;
          })
        )
      );

      block.appendChild(
        this.createJsonCard("Shape", component.shape, "{ \"type\": \"circle\", \"radius\": 2 }", (data) =>
          this.store.updateSkill(skill.id, (draft) => {
            draft.components[index].shape = data as SkillComponent["shape"];
          })
        )
      );
      block.appendChild(
        this.createJsonCard("Motion", component.motion, "{ \"kind\": \"followCaster\" }", (data) =>
          this.store.updateSkill(skill.id, (draft) => {
            draft.components[index].motion = data;
          })
        )
      );
      block.appendChild(
        this.createJsonCard("Limits", component.limits, "{ \"maxTargets\": 5 }", (data) =>
          this.store.updateSkill(skill.id, (draft) => {
            draft.components[index].limits = data;
          })
        )
      );
      block.appendChild(
        this.createJsonCard("Damage", component.damage, "{ \"baseMult\": 1.1 }", (data) =>
          this.store.updateSkill(skill.id, (draft) => {
            draft.components[index].damage = data;
          })
        )
      );

      card.appendChild(block);
    });

    return card;
  }

  private createJsonCard<T>(
    label: string,
    value: T | undefined,
    placeholder: string,
    onSave: (data: T | undefined) => void
  ): HTMLElement {
    const card = createCard();
    const title = document.createElement("span");
    title.textContent = label;
    title.style.fontSize = "12px";
    title.style.fontWeight = "600";
    card.appendChild(title);

    const textarea = document.createElement("textarea");
    textarea.value = value ? JSON.stringify(value, null, 2) : "";
    textarea.placeholder = placeholder;
    textarea.style.width = "100%";
    textarea.style.minHeight = "80px";
    textarea.style.padding = "6px";
    textarea.style.borderRadius = "6px";
    textarea.style.border = "1px solid rgba(255,255,255,0.1)";
    textarea.style.background = "rgba(255,255,255,0.04)";
    textarea.style.color = "inherit";
    card.appendChild(textarea);

    const row = document.createElement("div");
    row.style.display = "flex";
    row.style.justifyContent = "flex-end";
    row.style.gap = "6px";

    row.appendChild(createButton("Clear", () => onSave(undefined)));
    row.appendChild(
      createButton("Apply", () => {
        try {
          const text = textarea.value.trim();
          if (!text) {
            onSave(undefined);
          } else {
            onSave(JSON.parse(text) as T);
          }
        } catch (error) {
          console.warn("[SkillLabPanel] JSON parse failed", error);
        }
      }, true)
    );

    card.appendChild(row);
    return card;
  }

  private renderSupports(state: SkillDraftState): void {
    if (!this.supportsView) {
      return;
    }
    this.supportsView.innerHTML = "";
    const skill = state.skills.find((s) => s.id === state.selectedSkillId);
    if (!skill) {
      return;
    }
    const issues = state.supportIssues ?? {};
    const applied = new Set(state.appliedSupports[skill.id] ?? []);
    state.supports.forEach((support) => {
      const row = document.createElement("label");
      row.style.display = "flex";
      row.style.flexDirection = "column";
      row.style.gap = "2px";
      row.style.padding = "6px";
      row.style.border = "1px solid rgba(255,255,255,0.08)";
      row.style.borderRadius = "6px";
      row.style.background = applied.has(support.id)
        ? "rgba(255,255,255,0.12)"
        : "rgba(255,255,255,0.04)";

      const title = document.createElement("div");
      title.style.display = "flex";
      title.style.alignItems = "center";
      title.style.gap = "6px";

      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = applied.has(support.id);
      const validation = validateSupport(skill, support);
      const supportIssue = validation.valid ? issues[support.id] : validation.reason;
      if (!validation.valid) {
        checkbox.disabled = true;
        row.style.opacity = "0.6";
      }
      checkbox.onchange = () => this.store.toggleSupport(skill.id, support.id);
      title.appendChild(checkbox);

      const name = document.createElement("span");
      name.textContent = support.name;
      name.style.fontWeight = "600";
      title.appendChild(name);
      row.appendChild(title);

      const desc = document.createElement("span");
      desc.textContent = support.description;
      desc.style.fontSize = "11px";
      desc.style.opacity = "0.75";
        row.appendChild(desc);
        if (supportIssue) {
          const issue = document.createElement("span");
          issue.textContent = supportIssue;
          issue.style.fontSize = "11px";
          issue.style.color = "#f7c06a";
          row.appendChild(issue);
        }

      this.supportsView.appendChild(row);
    });
  }

  private renderTrace(state: SkillDraftState): void {
    if (!this.traceView) {
      return;
    }
    this.traceView.innerHTML = "";
    if (state.opTrace.length === 0) {
      const empty = document.createElement("div");
      empty.textContent = "No support operations applied.";
      empty.style.opacity = "0.65";
      empty.style.fontSize = "11px";
      this.traceView.appendChild(empty);
      return;
    }
    state.opTrace.forEach((entry) => {
      const line = document.createElement("div");
      line.textContent = `${entry.supportId} [${entry.phase}] ${entry.target} ${entry.op}`;
      this.traceView.appendChild(line);
    });
  }

  private renderSandbox(state: SkillDraftState): void {
    if (!this.sandboxView) {
      return;
    }
    this.sandboxView.innerHTML = "";

    const profiles = state.profiles ?? {};
    const activeProfile = profiles[state.activeProfileId];

    const profileRow = document.createElement("div");
    profileRow.style.display = "flex";
    profileRow.style.alignItems = "center";
    profileRow.style.gap = "8px";

    const profileLabel = document.createElement("span");
    profileLabel.textContent = "Profile";
    profileLabel.style.fontSize = "12px";
    profileLabel.style.opacity = "0.75";
    profileRow.appendChild(profileLabel);

    const profileSelect = document.createElement("select");
    styleInput(profileSelect);
    Object.keys(profiles).forEach((id) => {
      const option = document.createElement("option");
      option.value = id;
      option.textContent = id.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
      profileSelect.appendChild(option);
    });
    profileSelect.value = state.activeProfileId;
    profileSelect.onchange = () => this.store.applyProfile(profileSelect.value);
    profileRow.appendChild(profileSelect);

    if (activeProfile) {
      const profileNote = document.createElement("span");
      profileNote.textContent = `∞ Mana: ${
        activeProfile.toggles.infiniteMana ? "Yes" : "No"
      } • Ignore CD: ${activeProfile.toggles.ignoreCooldowns ? "Yes" : "No"}`;
      profileNote.style.fontSize = "11px";
      profileNote.style.opacity = "0.6";
      profileRow.appendChild(profileNote);
    }

    this.sandboxView.appendChild(profileRow);

    this.sandboxView.appendChild(
      createToggle("Low visibility", state.lowVisibility, (checked) =>
        this.store.setLowVisibility(checked)
      )
    );
    this.sandboxView.appendChild(
      createToggle("Infinite mana", state.infiniteMana, (checked) =>
        this.store.setInfiniteMana(checked)
      )
    );
    this.sandboxView.appendChild(
      createToggle("Ignore cooldowns", state.ignoreCooldowns, (checked) =>
        this.store.setIgnoreCooldowns(checked)
      )
    );
    this.sandboxView.appendChild(
      createToggle("Deterministic", state.deterministic, (checked) =>
        this.store.setDeterministic(checked)
      )
    );

    const levelRow = document.createElement("div");
    levelRow.style.display = "flex";
    levelRow.style.alignItems = "center";
    levelRow.style.gap = "8px";
    const label = document.createElement("span");
    label.textContent = "Simulate level";
    label.style.fontSize = "12px";
    label.style.opacity = "0.75";
    levelRow.appendChild(label);
    const input = document.createElement("input");
    input.type = "number";
    input.min = "1";
    input.value = state.simulateLevel.toString();
    styleInput(input);
    input.onchange = () => {
      const parsed = parseInt(input.value, 10);
      if (!Number.isNaN(parsed)) {
        this.store.setSimulateLevel(parsed);
      }
    };
    levelRow.appendChild(input);
    this.sandboxView.appendChild(levelRow);

    const choiceButton = createButton("Show Choice Panel", () => {
      const options = (this.state?.skills ?? []).slice(0, 3).map((skill) => ({
        id: skill.id,
        name: skill.name,
        description: skill.tags.join(", "),
      }));
      this.choicePanel.show({
        level: state.simulateLevel,
        options,
        onSelect: (id) => console.log("[SkillLab] choice", id),
      });
    });
    this.sandboxView.appendChild(choiceButton);

    const config = state.dummyConfig;
    this.dummySpawner.updateConfig(config);
    this.sandboxView.appendChild(
      labeledSelect(
        "Formation",
        [
          { value: "single", label: "Single" },
          { value: "pack", label: "Pack" },
          { value: "line", label: "Line" },
        ],
        config.formation,
        (value) => this.store.updateDummyConfig({ formation: value as typeof config.formation })
      )
    );
    this.sandboxView.appendChild(
      labeledNumber("Count", config.count, 1, (value) =>
        this.store.updateDummyConfig({ count: Math.max(1, Math.floor(value)) })
      )
    );
    this.sandboxView.appendChild(
      labeledNumber("Armor", config.armor, 0, (value) =>
        this.store.updateDummyConfig({ armor: Math.max(0, Math.floor(value)) })
      )
    );
    this.sandboxView.appendChild(
      labeledNumber("Max HP", config.maxHealth, 1, (value) =>
        this.store.updateDummyConfig({ maxHealth: Math.max(1, Math.floor(value)) })
      )
    );
    this.sandboxView.appendChild(
      labeledNumber("Move Speed", config.moveSpeed, 0, (value) =>
        this.store.updateDummyConfig({ moveSpeed: value })
      )
    );
    this.sandboxView.appendChild(
      createButton("Spawn Dummies", () => {
        this.dummySpawner.updateConfig(state.dummyConfig);
        this.dummySpawner.spawn();
      }, true)
    );
  }

  private updateToolbar(state: SkillDraftState): void {
    if (this.undoButton) this.undoButton.disabled = !state.undoAvailable;
    if (this.redoButton) this.redoButton.disabled = !state.redoAvailable;
    if (this.autosaveLabel) {
      this.autosaveLabel.textContent = `Autosaved: ${formatTimestamp(state.lastSaveAt)}`;
    }
    if (this.commitLabel) {
      this.commitLabel.textContent = `Last commit: ${formatTimestamp(state.lastCommitAt)}`;
    }
  }

  private promptImport(): void {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json";
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      file
        .text()
        .then((text) => {
          const snapshot = JSON.parse(text) as SkillLabSnapshot;
          this.store.importSnapshot(snapshot);
        })
        .catch((error) => console.warn("[SkillLabPanel] import failed", error));
    };
    input.click();
  }

  private applyLowVisibility(enabled: boolean): void {
    if (!this.root) {
      return;
    }
    this.root.style.background = enabled
      ? "rgba(3,4,8,0.9)"
      : "rgba(6, 8, 14, 0.94)";
  }

  private assignKeybind(slotId: string): void {
    const skill = this.state?.skills.find((s) => s.id === this.state?.selectedSkillId);
    if (!skill) {
      return;
    }
    this.keybindAssignments[slotId] = skill.name;
    this.keybindBar.setSlots(
      DEFAULT_KEYBIND_SLOTS.map((slot) => ({
        ...slot,
        skillName: this.keybindAssignments[slot.id],
      }))
    );
  }
}
function createDefaultComponent(): SkillComponent {
  return {
    id: `component-${Date.now().toString(36)}`,
    timing: { start: 0 },
    shape: { type: "circle", radius: 2 },
  };
}

function createButton(label: string, onClick: () => void, accent = false): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  button.style.padding = "6px 10px";
  button.style.borderRadius = "6px";
  button.style.border = accent
    ? "1px solid rgba(138,170,255,0.8)"
    : "1px solid rgba(255,255,255,0.14)";
  button.style.background = accent
    ? "rgba(98,126,255,0.25)"
    : "rgba(255,255,255,0.05)";
  button.style.color = "inherit";
  button.style.cursor = "pointer";
  button.onclick = (event) => {
    event.preventDefault();
    event.stopPropagation();
    onClick();
  };
  return button;
}

function labeledInput(label: string, value: string, onChange: (value: string) => void): HTMLDivElement {
  const wrapper = document.createElement("div");
  wrapper.style.display = "flex";
  wrapper.style.flexDirection = "column";
  wrapper.style.gap = "4px";
  const span = document.createElement("span");
  span.textContent = label;
  span.style.fontSize = "12px";
  span.style.opacity = "0.75";
  wrapper.appendChild(span);
  const input = document.createElement("input");
  input.type = "text";
  input.value = value;
  styleInput(input);
  input.onchange = () => onChange(input.value);
  wrapper.appendChild(input);
  return wrapper;
}

function labeledNumber(label: string, value: number, min: number, onChange: (value: number) => void): HTMLDivElement {
  const wrapper = document.createElement("div");
  wrapper.style.display = "flex";
  wrapper.style.flexDirection = "column";
  wrapper.style.gap = "4px";
  const span = document.createElement("span");
  span.textContent = label;
  span.style.fontSize = "12px";
  span.style.opacity = "0.75";
  wrapper.appendChild(span);
  const input = document.createElement("input");
  input.type = "number";
  input.value = value.toString();
  input.min = min.toString();
  styleInput(input);
  input.onchange = () => {
    const parsed = parseFloat(input.value);
    if (!Number.isNaN(parsed)) {
      onChange(parsed);
    }
  };
  wrapper.appendChild(input);
  return wrapper;
}

function labeledSelect<T extends string>(
  label: string,
  options: { value: T; label: string }[],
  current: T,
  onChange: (value: T) => void
): HTMLDivElement {
  const wrapper = document.createElement("div");
  wrapper.style.display = "flex";
  wrapper.style.flexDirection = "column";
  wrapper.style.gap = "4px";
  const span = document.createElement("span");
  span.textContent = label;
  span.style.fontSize = "12px";
  span.style.opacity = "0.75";
  wrapper.appendChild(span);
  const select = document.createElement("select");
  options.forEach((option) => {
    const opt = document.createElement("option");
    opt.value = option.value;
    opt.textContent = option.label;
    select.appendChild(opt);
  });
  select.value = current;
  styleInput(select);
  select.onchange = () => onChange(select.value as T);
  wrapper.appendChild(select);
  return wrapper;
}

function createToggle(label: string, checked: boolean, onToggle: (checked: boolean) => void): HTMLLabelElement {
  const wrapper = document.createElement("label");
  wrapper.style.display = "flex";
  wrapper.style.alignItems = "center";
  wrapper.style.gap = "8px";
  const input = document.createElement("input");
  input.type = "checkbox";
  input.checked = checked;
  input.onchange = () => onToggle(input.checked);
  wrapper.appendChild(input);
  const span = document.createElement("span");
  span.textContent = label;
  span.style.fontSize = "12px";
  wrapper.appendChild(span);
  return wrapper;
}

function styleInput(input: HTMLInputElement | HTMLSelectElement): void {
  input.style.padding = "6px 8px";
  input.style.borderRadius = "6px";
  input.style.border = "1px solid rgba(255,255,255,0.12)";
  input.style.background = "rgba(255,255,255,0.06)";
  input.style.color = "inherit";
}

function createCard(): HTMLDivElement {
  const card = document.createElement("div");
  card.style.border = "1px solid rgba(255,255,255,0.08)";
  card.style.background = "rgba(255,255,255,0.03)";
  card.style.borderRadius = "8px";
  card.style.padding = "10px";
  card.style.display = "flex";
  card.style.flexDirection = "column";
  card.style.gap = "6px";
  return card;
}

function createChip(tag: string, active: boolean): HTMLButtonElement {
  const chip = document.createElement("button");
  chip.type = "button";
  chip.textContent = tag;
  chip.style.padding = "4px 6px";
  chip.style.fontSize = "11px";
  chip.style.borderRadius = "4px";
  chip.style.cursor = "pointer";
  chip.style.border = active
    ? "1px solid rgba(255,255,255,0.35)"
    : "1px solid rgba(255,255,255,0.12)";
  chip.style.background = active
    ? "rgba(255,255,255,0.16)"
    : "rgba(255,255,255,0.04)";
  return chip;
}

function formatTimestamp(timestamp: number): string {
  if (!timestamp) {
    return "--";
  }
  return new Date(timestamp).toLocaleTimeString();
}

function downloadSnapshot(snapshot: SkillLabSnapshot): void {
  const blob = new Blob([JSON.stringify(snapshot, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `skill-lab-${new Date().toISOString()}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

