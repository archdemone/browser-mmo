export interface HudState {
  hp: number;
  maxHP: number;
  stamina: number;
  maxStamina: number;
  xp: number;
  level: number;
  xpForNextLevel: number;
  showEnterPrompt: boolean;
  showDeathBanner: boolean;
  cooldowns?: {
    attackReady: boolean;
    dodgeReady: boolean;
    skill1Ready: boolean;
    skill2Ready: boolean;
  };
}

class HudUIImpl {
  private root: HTMLDivElement | null = null;
  private hpBarInner: HTMLDivElement | null = null;
  private hpText: HTMLSpanElement | null = null;
  private staminaBarInner: HTMLDivElement | null = null;
  private staminaText: HTMLSpanElement | null = null;
  private xpBarInner: HTMLDivElement | null = null;
  private xpText: HTMLSpanElement | null = null;
  private levelText: HTMLSpanElement | null = null;
  private abilityBar: HTMLDivElement | null = null;
  private attackSlot: HTMLDivElement | null = null;
  private dodgeSlot: HTMLDivElement | null = null;
  private skill1Slot: HTMLDivElement | null = null;
  private skill2Slot: HTMLDivElement | null = null;
  private enterPrompt: HTMLDivElement | null = null;
  private deathBanner: HTMLDivElement | null = null;
  private attackHandler: (() => void) | null = null;
  private dodgeHandler: (() => void) | null = null;
  private enterHandler: (() => void) | null = null;
  private spawnHandler: (() => void) | null = null;
  private invincibilityCheckbox: HTMLInputElement | null = null;
  private spawnButton: HTMLButtonElement | null = null;

  init(): void {
    if (typeof document === "undefined") {
      return;
    }

    if (this.root) {
      return;
    }

    const existingRoot = document.getElementById("hud-root") as HTMLDivElement | null;
    if (existingRoot) {
      this.root = existingRoot;
      this.captureElements(existingRoot);
      return;
    }

    const root = document.createElement("div");
    root.id = "hud-root";
    root.style.position = "fixed";
    root.style.left = "0";
    root.style.top = "0";
    root.style.width = "100%";
    root.style.height = "100%";
    root.style.pointerEvents = "none";
    root.style.color = "#f0f0f0";
    root.style.fontFamily = "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
    root.style.fontSize = "14px";
    root.style.zIndex = "999";

    const topLeft = document.createElement("div");
    topLeft.style.position = "absolute";
    topLeft.style.left = "16px";
    topLeft.style.top = "16px";
    topLeft.style.display = "flex";
    topLeft.style.flexDirection = "column";
    topLeft.style.gap = "8px";
    topLeft.style.pointerEvents = "none";
    root.appendChild(topLeft);

    const hpContainer = this.createBarContainer("HP", "#c33232", "160px");
    topLeft.appendChild(hpContainer.container);
    this.hpBarInner = hpContainer.inner;
    this.hpText = hpContainer.text;

    const staminaContainer = this.createBarContainer("Stamina", "#4371d8", "160px");
    topLeft.appendChild(staminaContainer.container);
    this.staminaBarInner = staminaContainer.inner;
    this.staminaText = staminaContainer.text;

    const xpContainer = document.createElement("div");
    xpContainer.style.display = "flex";
    xpContainer.style.flexDirection = "column";
    xpContainer.style.gap = "4px";
    xpContainer.style.pointerEvents = "none";

    const xpLabelRow = document.createElement("div");
    xpLabelRow.style.display = "flex";
    xpLabelRow.style.alignItems = "center";
    xpLabelRow.style.gap = "8px";

    const xpLabel = document.createElement("span");
    xpLabel.textContent = "XP";
    xpLabel.style.fontWeight = "600";
    xpLabelRow.appendChild(xpLabel);

    this.levelText = document.createElement("span");
    this.levelText.textContent = "Lv 1";
    this.levelText.style.fontSize = "12px";
    this.levelText.style.opacity = "0.85";
    xpLabelRow.appendChild(this.levelText);

    xpContainer.appendChild(xpLabelRow);

    const xpBarOuter = document.createElement("div");
    xpBarOuter.style.width = "160px";
    xpBarOuter.style.height = "8px";
    xpBarOuter.style.background = "rgba(255, 255, 255, 0.15)";
    xpBarOuter.style.border = "1px solid rgba(255, 255, 255, 0.25)";
    xpBarOuter.style.position = "relative";
    xpBarOuter.style.borderRadius = "4px";
    xpBarOuter.style.overflow = "hidden";
    xpBarOuter.style.pointerEvents = "none";

    const xpBarInner = document.createElement("div");
    xpBarInner.style.height = "100%";
    xpBarInner.style.width = "0%";
    xpBarInner.style.background = "#f5d96b";
    xpBarOuter.appendChild(xpBarInner);
    this.xpBarInner = xpBarInner;

    xpContainer.appendChild(xpBarOuter);

    this.xpText = document.createElement("span");
    this.xpText.textContent = "0 / 100";
    this.xpText.style.fontSize = "12px";
    this.xpText.style.opacity = "0.85";
    xpContainer.appendChild(this.xpText);

    topLeft.appendChild(xpContainer);

    // Spawn button
    this.spawnButton = document.createElement("button");
    this.spawnButton.textContent = "Spawn Enemy";
    this.spawnButton.style.padding = "6px 12px";
    this.spawnButton.style.fontSize = "12px";
    this.spawnButton.style.background = "rgba(255, 100, 100, 0.8)";
    this.spawnButton.style.border = "1px solid rgba(255, 255, 255, 0.3)";
    this.spawnButton.style.borderRadius = "4px";
    this.spawnButton.style.color = "white";
    this.spawnButton.style.cursor = "pointer";
    this.spawnButton.style.pointerEvents = "auto";
    this.spawnButton.onclick = () => {
      if (this.spawnHandler) {
        this.spawnHandler();
      }
    };
    topLeft.appendChild(this.spawnButton);

    // Invincibility checkbox
    const invincibilityContainer = document.createElement("div");
    invincibilityContainer.style.display = "flex";
    invincibilityContainer.style.alignItems = "center";
    invincibilityContainer.style.gap = "6px";
    invincibilityContainer.style.pointerEvents = "auto";

    this.invincibilityCheckbox = document.createElement("input");
    this.invincibilityCheckbox.type = "checkbox";
    this.invincibilityCheckbox.id = "invincibility-toggle";
    this.invincibilityCheckbox.style.cursor = "pointer";

    const invincibilityLabel = document.createElement("label");
    invincibilityLabel.textContent = "Player Invincible";
    invincibilityLabel.htmlFor = "invincibility-toggle";
    invincibilityLabel.style.fontSize = "12px";
    invincibilityLabel.style.color = "#f0f0f0";
    invincibilityLabel.style.cursor = "pointer";

    invincibilityContainer.appendChild(this.invincibilityCheckbox);
    invincibilityContainer.appendChild(invincibilityLabel);
    topLeft.appendChild(invincibilityContainer);

    this.abilityBar = document.createElement("div");
    this.abilityBar.style.position = "absolute";
    this.abilityBar.style.bottom = "16px";
    this.abilityBar.style.left = "50%";
    this.abilityBar.style.transform = "translateX(-50%)";
    this.abilityBar.style.display = "flex";
    this.abilityBar.style.gap = "8px";
    this.abilityBar.style.pointerEvents = "none";
    root.appendChild(this.abilityBar);

    this.attackSlot = this.createAbilitySlot("LMB", "Attack", true);
    this.attackSlot.classList.add("attack-button");
    this.dodgeSlot = this.createAbilitySlot("Space", "Dodge", true);
    this.skill1Slot = this.createAbilitySlot("Q", "Skill 1", false);
    this.skill2Slot = this.createAbilitySlot("W", "Skill 2", false);

    this.abilityBar.appendChild(this.attackSlot);
    this.abilityBar.appendChild(this.dodgeSlot);
    this.abilityBar.appendChild(this.skill1Slot);
    this.abilityBar.appendChild(this.skill2Slot);

    this.enterPrompt = document.createElement("div");
    this.enterPrompt.style.position = "absolute";
    this.enterPrompt.style.top = "15%";
    this.enterPrompt.style.left = "50%";
    this.enterPrompt.style.transform = "translateX(-50%)";
    this.enterPrompt.style.padding = "8px 14px";
    this.enterPrompt.style.background = "rgba(12, 14, 20, 0.85)";
    this.enterPrompt.style.border = "1px solid rgba(255, 255, 255, 0.2)";
    this.enterPrompt.style.borderRadius = "6px";
    this.enterPrompt.style.fontSize = "15px";
    this.enterPrompt.style.display = "none";
    this.enterPrompt.style.cursor = "pointer";
    this.enterPrompt.style.pointerEvents = "none";
    root.appendChild(this.enterPrompt);

    this.deathBanner = document.createElement("div");
    this.deathBanner.style.position = "absolute";
    this.deathBanner.style.left = "50%";
    this.deathBanner.style.top = "50%";
    this.deathBanner.style.transform = "translate(-50%, -50%)";
    this.deathBanner.style.padding = "12px 24px";
    this.deathBanner.style.background = "rgba(40, 0, 0, 0.85)";
    this.deathBanner.style.border = "2px solid rgba(255, 80, 80, 0.9)";
    this.deathBanner.style.borderRadius = "8px";
    this.deathBanner.style.fontSize = "20px";
    this.deathBanner.style.fontWeight = "700";
    this.deathBanner.style.display = "none";
    this.deathBanner.style.pointerEvents = "none";
    this.deathBanner.textContent = "YOU DIED – respawning...";
    root.appendChild(this.deathBanner);

    document.body.appendChild(root);
    this.root = root;

    this.attachEventHandlers();
  }

  update(state: HudState): void {
    if (!this.root) {
      this.init();
    }
    if (!this.root) {
      return;
    }

    const hpPercent = Math.max(0, Math.min(1, state.maxHP > 0 ? state.hp / state.maxHP : 0));
    if (this.hpBarInner) {
      this.hpBarInner.style.width = `${(hpPercent * 100).toFixed(1)}%`;
    }
    if (this.hpText) {
      this.hpText.textContent = `${Math.round(state.hp)} / ${Math.round(state.maxHP)}`;
    }

    const staminaPercent = Math.max(0, Math.min(1, state.maxStamina > 0 ? state.stamina / state.maxStamina : 0));
    if (this.staminaBarInner) {
      this.staminaBarInner.style.width = `${(staminaPercent * 100).toFixed(1)}%`;
    }
    if (this.staminaText) {
      this.staminaText.textContent = `${Math.round(state.stamina)} / ${Math.round(state.maxStamina)}`;
    }

    const xpThreshold = Math.max(1, state.xpForNextLevel);
    if (this.levelText) {
      this.levelText.textContent = `Lv ${Math.max(1, Math.round(state.level))}`;
    }

    if (this.xpText) {
      this.xpText.textContent = `${Math.round(state.xp)} / ${xpThreshold}`;
    }
    if (this.xpBarInner) {
      const xpPercent = Math.max(0, Math.min(1, xpThreshold > 0 ? state.xp / xpThreshold : 0));
      this.xpBarInner.style.width = `${(xpPercent * 100).toFixed(1)}%`;
    }

    if (this.enterPrompt) {
      if (state.showEnterPrompt) {
        this.enterPrompt.style.display = "block";
        this.enterPrompt.textContent = "Press E or Left Click to enter dungeon";
        this.enterPrompt.style.pointerEvents = "auto";
      } else {
        this.enterPrompt.style.display = "none";
        this.enterPrompt.style.pointerEvents = "none";
      }
    }

    if (this.deathBanner) {
      this.deathBanner.style.display = state.showDeathBanner ? "block" : "none";
    }

    const cooldowns = state.cooldowns;
    this.updateAbilitySlot(this.attackSlot, cooldowns?.attackReady ?? true);
    this.updateAbilitySlot(this.dodgeSlot, cooldowns?.dodgeReady ?? true);
    this.updateAbilitySlot(this.skill1Slot, cooldowns?.skill1Ready ?? false);
    this.updateAbilitySlot(this.skill2Slot, cooldowns?.skill2Ready ?? false);
  }

  onClickAttack(cb: (() => void) | null): void {
    this.attackHandler = cb;
  }

  onClickDodge(cb: (() => void) | null): void {
    this.dodgeHandler = cb;
  }

  onClickEnterDungeon(cb: (() => void) | null): void {
    this.enterHandler = cb;
  }

  onClickSpawn(cb: (() => void) | null): void {
    this.spawnHandler = cb;
  }

  getInvincibilityState(): boolean {
    return this.invincibilityCheckbox?.checked ?? false;
  }

  private captureElements(root: HTMLDivElement): void {
    // In case of pre-existing markup (dev hot reload), rebuild structure.
    root.innerHTML = "";
    this.root = null;
    this.hpBarInner = null;
    this.hpText = null;
    this.staminaBarInner = null;
    this.staminaText = null;
    this.xpBarInner = null;
    this.xpText = null;
    this.levelText = null;
    this.attackSlot = null;
    this.dodgeSlot = null;
    this.skill1Slot = null;
    this.skill2Slot = null;
    this.enterPrompt = null;
    this.deathBanner = null;
    this.init();
  }

  private createBarContainer(
    label: string,
    color: string,
    width: string
  ): { container: HTMLDivElement; inner: HTMLDivElement; text: HTMLSpanElement } {
    const container = document.createElement("div");
    container.style.display = "flex";
    container.style.flexDirection = "column";
    container.style.gap = "4px";
    container.style.pointerEvents = "none";

    const labelRow = document.createElement("div");
    labelRow.style.display = "flex";
    labelRow.style.justifyContent = "space-between";
    labelRow.style.alignItems = "center";
    labelRow.style.gap = "8px";

    const labelSpan = document.createElement("span");
    labelSpan.textContent = label;
    labelSpan.style.fontWeight = "600";
    labelRow.appendChild(labelSpan);

    const valueSpan = document.createElement("span");
    valueSpan.textContent = "0 / 0";
    valueSpan.style.fontSize = "12px";
    valueSpan.style.opacity = "0.85";
    labelRow.appendChild(valueSpan);

    const barOuter = document.createElement("div");
    barOuter.style.width = width;
    barOuter.style.height = "16px";
    barOuter.style.background = "rgba(255, 255, 255, 0.12)";
    barOuter.style.border = "1px solid rgba(255, 255, 255, 0.25)";
    barOuter.style.position = "relative";
    barOuter.style.borderRadius = "4px";
    barOuter.style.overflow = "hidden";
    barOuter.style.pointerEvents = "none";

    const barInner = document.createElement("div");
    barInner.style.height = "100%";
    barInner.style.width = "0%";
    barInner.style.background = color;
    barOuter.appendChild(barInner);

    container.appendChild(labelRow);
    container.appendChild(barOuter);

    return { container, inner: barInner, text: valueSpan };
  }

  private createAbilitySlot(key: string, label: string, clickable: boolean): HTMLDivElement {
    const slot = document.createElement("div");
    slot.style.width = "56px";
    slot.style.height = "56px";
    slot.style.border = "2px solid rgba(255, 255, 255, 0.35)";
    slot.style.borderRadius = "6px";
    slot.style.background = "rgba(10, 12, 18, 0.75)";
    slot.style.display = "flex";
    slot.style.flexDirection = "column";
    slot.style.justifyContent = "center";
    slot.style.alignItems = "center";
    slot.style.gap = "4px";
    slot.style.fontSize = "12px";
    slot.style.pointerEvents = clickable ? "auto" : "none";
    slot.style.cursor = clickable ? "pointer" : "default";

    const keyLabel = document.createElement("div");
    keyLabel.textContent = key;
    keyLabel.style.fontWeight = "700";
    keyLabel.style.fontSize = "13px";
    slot.appendChild(keyLabel);

    const actionLabel = document.createElement("div");
    actionLabel.textContent = label;
    actionLabel.style.opacity = "0.85";
    actionLabel.style.fontSize = "11px";
    slot.appendChild(actionLabel);

    return slot;
  }

  private attachEventHandlers(): void {
    if (this.attackSlot) {
      this.attackSlot.addEventListener("click", () => {
        if (this.attackHandler) {
          this.attackHandler();
        }
      });
    }

    if (this.dodgeSlot) {
      this.dodgeSlot.addEventListener("click", () => {
        if (this.dodgeHandler) {
          this.dodgeHandler();
        }
      });
    }

    if (this.enterPrompt) {
      this.enterPrompt.addEventListener("click", (event) => {
        if (!this.enterHandler) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        this.enterHandler();
      });
    }
  }

  private updateAbilitySlot(slot: HTMLDivElement | null, ready: boolean): void {
    if (!slot) {
      return;
    }
    slot.style.opacity = ready ? "1" : "0.4";
  }
}

export const HudUI = new HudUIImpl();
