export interface KeybindSlot {
  id: string;
  label: string;
  skillName?: string;
}

export interface KeybindBarOptions {
  slots: KeybindSlot[];
  onAssign?: (slotId: string) => void;
}

export class KeybindBar {
  private root: HTMLDivElement;
  private slots: KeybindSlot[];
  private onAssign?: (slotId: string) => void;

  constructor(options: KeybindBarOptions) {
    this.slots = options.slots;
    this.onAssign = options.onAssign;
    this.root = document.createElement("div");
    this.root.className = "skilllab-keybind-bar";
    this.render();
  }

  getElement(): HTMLDivElement {
    return this.root;
  }

  setSlots(slots: KeybindSlot[]): void {
    this.slots = slots;
    this.render();
  }

  private render(): void {
    this.root.innerHTML = "";
    this.root.style.display = "grid";
    this.root.style.gridTemplateColumns = "repeat(auto-fit, minmax(60px, 1fr))";
    this.root.style.gap = "8px";
    this.root.style.padding = "8px";
    this.root.style.background = "rgba(10, 10, 10, 0.45)";
    this.root.style.border = "1px solid rgba(255, 255, 255, 0.08)";
    this.root.style.borderRadius = "8px";

    this.slots.forEach((slot) => {
      const button = document.createElement("button");
      button.className = "skilllab-keybind-slot";
      button.style.display = "flex";
      button.style.flexDirection = "column";
      button.style.alignItems = "center";
      button.style.justifyContent = "center";
      button.style.padding = "8px";
      button.style.background = "rgba(255, 255, 255, 0.04)";
      button.style.border = "1px solid rgba(255, 255, 255, 0.12)";
      button.style.borderRadius = "6px";
      button.style.cursor = "pointer";
      button.style.color = "#f5f5f5";
      button.style.fontSize = "12px";
      button.style.minHeight = "64px";

      const label = document.createElement("span");
      label.textContent = slot.label;
      label.style.fontWeight = "600";
      label.style.opacity = "0.8";
      button.appendChild(label);

      const skill = document.createElement("span");
      skill.textContent = slot.skillName ?? "Unassigned";
      skill.style.marginTop = "4px";
      skill.style.fontSize = "11px";
      skill.style.opacity = slot.skillName ? "1" : "0.6";
      button.appendChild(skill);

      button.onclick = (event) => {
        event.preventDefault();
        event.stopPropagation();
        this.onAssign?.(slot.id);
      };

      this.root.appendChild(button);
    });
  }
}

